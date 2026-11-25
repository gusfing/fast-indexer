/**
 * Kawaki Rapid Indexer - Local Dashboard Server
 * Runs a standalone HTTP + SSE server on port 4040.
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

const PORT = process.env.PORT || 4040;
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
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(indexPath));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('index.html not found');
  }

  // API: Status
  if (pathname === '/api/status' && req.method === 'GET') {
    const hasServiceAccount = fs.existsSync(path.join(__dirname, 'service-account.json'));
    let hasGoogleapis = false;
    try {
      require('./modules/google-indexer');
      hasGoogleapis = true;
    } catch (e) {}

    return sendJson(res, 200, {
      ok: true,
      serviceAccount: hasServiceAccount,
      googleapis: hasGoogleapis,
      site: 'https://kawaki.co.in',
      indexNowKey: '262ab81b1de8469b20c5678a83f31ba5'
    });
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

  // API: Run Execution (Streaming SSE)
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

      const stats = {
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
        // Stage 1: Pre-flight checks (run for full, google, indexnow, browser)
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

        // Stage 4: RSS & XML-RPC Ping Cascade
        if (mode === 'full' || mode === 'ping') {
          log('[Stage 4] Dispatching RSS XML-RPC & WebSub feed pings...');
          const pingRes = await runPingCascade(log);
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
          id: 'run_' + Date.now(),
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
  console.log(`🚀 Kawaki Rapid Indexer Dashboard running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
