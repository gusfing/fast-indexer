/**
 * Fast Indexer - Production HTTP & REST API Server
 * Features:
 * - Direct Multi-Engine Rapid Indexing
 * - Isolated RSS 2.0 Feed Generation & Serving (/rss/:id.xml)
 * - Real-Time Search Engine & Googlebot Crawl Telemetry (/api/v1/bot-logs)
 * - REST API v1 with API Key Authentication (/api/v1/index)
 * - Real-Time Server-Sent Events (SSE) Live Stream for Web GUI (/api/run)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { validateUrls } = require('./modules/preflight');
const { publishGoogleIndex } = require('./modules/google-indexer');
const { submitIndexNow } = require('./modules/indexnow');
const { runPingCascade } = require('./modules/ping-cascade');
const { visitUrlsWithChrome } = require('./modules/browser-ping');
const { saveIsolatedFeed, getFeedXml, listFeeds } = require('./modules/rss-generator');
const { recordBotVisit, readBotLogs, getBotStats } = require('./modules/bot-logger');

const PORT = process.env.PORT || 4040;
const API_KEY = process.env.API_KEY || null;
const BASE_URL = process.env.BASE_URL || null;

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CORE_URLS_FILE = path.join(DATA_DIR, 'core-urls.json');

function readJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  if (!API_KEY) return true; // Open if no API key configured
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const customHeader = req.headers['x-api-key'] || '';
  return token === API_KEY || customHeader === API_KEY;
}

const server = http.createServer(async (req, res) => {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const currentBaseUrl = BASE_URL || `${protocol}://${hostHeader}`;
  const parsedUrl = new URL(req.url, currentBaseUrl);
  const pathname = parsedUrl.pathname;

  // Real-time Search Engine Crawler / Googlebot Tracker
  // Inspects every request to detect Googlebot, Bingbot, etc.
  try {
    recordBotVisit(req, { endpoint: pathname });
  } catch (bErr) {}

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
    });
    return res.end();
  }

  // Static GUI Dashboard
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(indexPath));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('index.html not found');
  }

  // ========================================================
  // ISOLATED RSS FEED ENDPOINTS
  // ========================================================
  if (pathname.startsWith('/rss/')) {
    const feedId = pathname.replace(/^\/rss\//, '').replace(/\.xml$/, '');
    const xml = getFeedXml(feedId);
    if (xml) {
      res.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=60'
      });
      return res.end(xml);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Isolated RSS Feed "${feedId}" not found.`);
  }

  // Tracking redirect / pixel endpoint for external crawlers
  if (pathname === '/track') {
    const target = parsedUrl.searchParams.get('url');
    if (target) {
      res.writeHead(302, { 'Location': target });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Fast Indexer Crawler Telemetry Ping Logged.');
  }

  // ========================================================
  // SYSTEM & CRAWLER TELEMETRY API
  // ========================================================
  if ((pathname === '/api/status' || pathname === '/api/v1/status') && req.method === 'GET') {
    const hasServiceAccount = fs.existsSync(path.join(__dirname, 'service-account.json'));
    const botStats = getBotStats();
    let hasGoogleapis = false;
    try {
      require('./modules/google-indexer');
      hasGoogleapis = true;
    } catch (e) {}

    return sendJson(res, 200, {
      ok: true,
      serviceAccount: hasServiceAccount,
      googleapis: hasGoogleapis,
      authRequired: Boolean(API_KEY),
      baseUrl: currentBaseUrl,
      botTelemetry: botStats,
      indexNowKey: process.env.INDEXNOW_KEY || '262ab81b1de8469b20c5678a83f31ba5'
    });
  }

  // API: Get Googlebot & Search Crawler Logs
  if ((pathname === '/api/bot-logs' || pathname === '/api/v1/bot-logs') && req.method === 'GET') {
    const filter = parsedUrl.searchParams.get('bot');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
    let logs = readBotLogs();
    if (filter === 'google') {
      logs = logs.filter(l => l.isGoogle);
    } else if (filter === 'bing') {
      logs = logs.filter(l => l.bot && l.bot.includes('Bing'));
    }
    return sendJson(res, 200, {
      stats: getBotStats(),
      logs: logs.slice(0, limit)
    });
  }

  // API: Get Isolated RSS Feeds List
  if ((pathname === '/api/feeds' || pathname === '/api/v1/feeds') && req.method === 'GET') {
    const feeds = listFeeds();
    return sendJson(res, 200, { feeds });
  }

  // API: Core URLs
  if (pathname === '/api/core-urls' && req.method === 'GET') {
    const urls = readJsonFile(CORE_URLS_FILE, []);
    return sendJson(res, 200, { urls });
  }

  // API: History
  if (pathname === '/api/history' && req.method === 'GET') {
    const history = readJsonFile(HISTORY_FILE, []);
    return sendJson(res, 200, { history: history.slice(0, 50) });
  }

  // ========================================================
  // REST API v1: POST /api/v1/index (JSON Async & Webhook)
  // ========================================================
  if (pathname === '/api/v1/index' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: 'Unauthorized: Invalid or missing API key.' });
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON request body.' });
      }

      const rawUrls = Array.isArray(payload.urls) ? payload.urls : [];
      const urls = rawUrls.map(u => String(u).trim()).filter(u => u.startsWith('http://') || u.startsWith('https://'));
      const mode = payload.mode || 'full';

      if (!urls.length) {
        return sendJson(res, 400, { error: 'No valid URLs provided.' });
      }

      const batchId = 'batch_' + Date.now();
      const logs = [];
      const logger = (msg) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

      logger(`[API Start] Dispatching batch ${batchId} with ${urls.length} URLs in mode: ${mode.toUpperCase()}`);

      // 1. Generate Isolated RSS Feed
      const isolatedFeedUrl = `${currentBaseUrl}/rss/${batchId}.xml`;
      saveIsolatedFeed(batchId, urls, {
        title: payload.siteName || `Indexing Batch ${batchId}`,
        siteUrl: payload.siteUrl || (urls[0] ? new URL(urls[0]).origin : currentBaseUrl),
        feedUrl: isolatedFeedUrl
      });
      logger(`Isolated RSS feed published: ${isolatedFeedUrl}`);

      const stats = {
        batchId,
        timestamp: new Date().toISOString(),
        mode,
        totalUrls: urls.length,
        isolatedFeedUrl,
        preflightPassed: 0,
        googlePublished: 0,
        googleFailed: 0,
        indexNowStatus: null,
        pingCascade: null,
        browserVisits: 0
      };

      try {
        // Stage 1: Pre-flight
        if (mode === 'full' || mode === 'google' || mode === 'indexnow') {
          const checks = await validateUrls(urls, logger);
          stats.preflightPassed = checks.filter(r => r.valid).length;
        }

        // Stage 2: Google API
        if (mode === 'full' || mode === 'google') {
          try {
            const googleResults = await publishGoogleIndex(urls, logger);
            stats.googlePublished = googleResults.filter(r => r.success).length;
            stats.googleFailed = googleResults.filter(r => !r.success).length;
          } catch (gErr) {
            logger(`[Google Error] ${gErr.message}`);
          }
        }

        // Stage 3: IndexNow
        if (mode === 'full' || mode === 'indexnow') {
          const inRes = await submitIndexNow(urls, logger);
          stats.indexNowStatus = inRes.success ? 'Success' : inRes.error;
        }

        // Stage 4: Isolated Ping Cascade
        if (mode === 'full' || mode === 'ping') {
          const pingRes = await runPingCascade(logger, isolatedFeedUrl, payload.siteName, payload.siteUrl);
          stats.pingCascade = pingRes;
        }

        // Stage 5: Chrome Telemetry
        if (mode === 'full' || mode === 'browser') {
          const bRes = await visitUrlsWithChrome(urls, logger);
          stats.browserVisits = bRes.visited || 0;
        }

        // Save history
        const currentHistory = readJsonFile(HISTORY_FILE, []);
        currentHistory.unshift({ ...stats, id: batchId, sampleUrls: urls.slice(0, 3) });
        writeJsonFile(HISTORY_FILE, currentHistory.slice(0, 100));

        return sendJson(res, 200, {
          success: true,
          batchId,
          stats,
          logs
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, batchId, error: err.message, logs });
      }
    });
    return;
  }

  // ========================================================
  // SSE STREAMING FOR WEB GUI: POST /api/run
  // ========================================================
  if (pathname === '/api/run' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid JSON payload' });
      }

      const rawUrls = Array.isArray(payload.urls) ? payload.urls : [];
      const urls = rawUrls.map(u => String(u).trim()).filter(u => u.startsWith('http://') || u.startsWith('https://'));
      const mode = payload.mode || 'full';

      if (!urls.length) {
        return sendJson(res, 400, { error: 'No valid URLs provided.' });
      }

      const batchId = 'feed_' + Date.now();
      const isolatedFeedUrl = `${currentBaseUrl}/rss/${batchId}.xml`;

      // Generate isolated RSS feed immediately for this batch
      saveIsolatedFeed(batchId, urls, {
        title: `Rapid Index Feed ${batchId}`,
        siteUrl: urls[0] ? new URL(urls[0]).origin : currentBaseUrl,
        feedUrl: isolatedFeedUrl
      });

      // Initialize SSE stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const log = (msg) => {
        sendEvent('log', { message: msg, time: new Date().toLocaleTimeString() });
      };

      log(`[START] Initiating run for ${urls.length} target URL(s) in mode: ${mode.toUpperCase()}`);
      log(`[RSS] Generated isolated feed: ${isolatedFeedUrl}`);

      const stats = {
        batchId,
        isolatedFeedUrl,
        timestamp: new Date().toISOString(),
        mode,
        totalUrls: urls.length,
        preflightPassed: 0,
        googlePublished: 0,
        googleFailed: 0,
        indexNowStatus: null,
        pingCascade: null,
        browserVisits: 0
      };

      try {
        // Stage 1: Pre-flight checks
        if (mode === 'full' || mode === 'google' || mode === 'indexnow') {
          log('[Stage 1] Performing pre-flight canonical & HTTP status verification...');
          const checkResults = await validateUrls(urls, log);
          const validUrls = checkResults.filter(r => r.valid).map(r => r.url);
          stats.preflightPassed = validUrls.length;
          log(`Preflight complete: ${validUrls.length}/${urls.length} passed.`);
        }

        // Stage 2: Google Rapid Indexing API
        if (mode === 'full' || mode === 'google') {
          log('[Stage 2] Publishing batch to Google Indexing API...');
          try {
            const googleResults = await publishGoogleIndex(urls, log);
            stats.googlePublished = googleResults.filter(r => r.success).length;
            stats.googleFailed = googleResults.filter(r => !r.success).length;
            log(`Google API finished: ${stats.googlePublished} published, ${stats.googleFailed} failed.`);
          } catch (gErr) {
            log(`[Google API Error] ${gErr.message}`);
          }
        }

        // Stage 3: IndexNow (Bing / Yandex)
        if (mode === 'full' || mode === 'indexnow') {
          log('[Stage 3] Pinging IndexNow protocol endpoint...');
          const indexNowRes = await submitIndexNow(urls, log);
          stats.indexNowStatus = indexNowRes.success ? 'Success' : (indexNowRes.error || 'Failed');
        }

        // Stage 4: Isolated RSS & XML-RPC Ping Cascade
        if (mode === 'full' || mode === 'ping') {
          log(`[Stage 4] Dispatching XML-RPC & WebSub pings for isolated feed: ${isolatedFeedUrl}...`);
          const pingRes = await runPingCascade(log, isolatedFeedUrl);
          stats.pingCascade = pingRes;
        }

        // Stage 5: Headless Browser Telemetry
        if (mode === 'full' || mode === 'browser') {
          log('[Stage 5] Starting Headless Chrome telemetry simulation...');
          const browserRes = await visitUrlsWithChrome(urls, log);
          stats.browserVisits = browserRes.visited || 0;
        }

        log('[COMPLETE] All requested operations have finished successfully.');

        // Record history
        const currentHistory = readJsonFile(HISTORY_FILE, []);
        currentHistory.unshift({
          ...stats,
          id: batchId,
          sampleUrls: urls.slice(0, 3)
        });
        writeJsonFile(HISTORY_FILE, currentHistory.slice(0, 100));

        sendEvent('done', { success: true, stats });
      } catch (runErr) {
        log(`[FATAL ERROR] ${runErr.message}`);
        sendEvent('done', { success: false, error: runErr.message });
      }

      res.end();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use. Please close any running instance and retry.\n`);
  } else {
    console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Fast Indexer Server & REST API active at:`);
  console.log(`   Local URL:    http://localhost:${PORT}`);
  console.log(`   REST API:     http://localhost:${PORT}/api/v1/index`);
  console.log(`   Bot Tracker:  http://localhost:${PORT}/api/v1/bot-logs`);
  console.log(`   RSS Feeds:    http://localhost:${PORT}/rss/latest.xml`);
  console.log(`======================================================\n`);
});
