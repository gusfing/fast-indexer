/**
 * Googlebot & Crawler Telemetry Logger Module
 * Tracks, detects, and records search engine bot crawl visits in real time.
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOT_LOG_FILE = path.join(DATA_DIR, 'bot-logs.json');
const MAX_LOGS = 1000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const KNOWN_BOTS = [
  { pattern: /Googlebot-Mobile/i, name: 'Googlebot Smartphone', isGoogle: true },
  { pattern: /Googlebot-Image/i, name: 'Googlebot Image', isGoogle: true },
  { pattern: /Google-InspectionTool/i, name: 'Google Inspection Tool', isGoogle: true },
  { pattern: /AdsBot-Google/i, name: 'Google AdsBot', isGoogle: true },
  { pattern: /Mediapartners-Google/i, name: 'Google AdSense Bot', isGoogle: true },
  { pattern: /Storebot-Google/i, name: 'Google Storebot', isGoogle: true },
  { pattern: /Googlebot/i, name: 'Googlebot (Desktop)', isGoogle: true },
  { pattern: /bingbot/i, name: 'Bingbot', isGoogle: false },
  { pattern: /YandexBot/i, name: 'YandexBot', isGoogle: false },
  { pattern: /DuckDuckBot/i, name: 'DuckDuckBot', isGoogle: false },
  { pattern: /Baiduspider/i, name: 'Baiduspider', isGoogle: false },
  { pattern: /Slurp/i, name: 'Yahoo Slurp', isGoogle: false },
  { pattern: /Applebot/i, name: 'Applebot', isGoogle: false },
  { pattern: /AhrefsBot/i, name: 'AhrefsBot', isGoogle: false },
  { pattern: /SemrushBot/i, name: 'SemrushBot', isGoogle: false }
];

function identifyBot(userAgent = '') {
  if (!userAgent) return null;
  for (const bot of KNOWN_BOTS) {
    if (bot.pattern.test(userAgent)) {
      return { name: bot.name, isGoogle: bot.isGoogle };
    }
  }
  return null;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';
}

function readBotLogs() {
  ensureDataDir();
  try {
    if (fs.existsSync(BOT_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(BOT_LOG_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeBotLogs(logs) {
  ensureDataDir();
  try {
    fs.writeFileSync(BOT_LOG_FILE, JSON.stringify(logs.slice(0, MAX_LOGS), null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Perform asynchronous reverse DNS verification for Googlebot authenticity
 */
function verifyGooglebotIp(ip) {
  return new Promise((resolve) => {
    // Skip local or private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return resolve({ verified: false, hostname: 'localhost/private' });
    }

    dns.reverse(ip, (err, hostnames) => {
      if (err || !hostnames || !hostnames.length) {
        return resolve({ verified: false, hostname: null });
      }
      const host = hostnames[0].toLowerCase();
      const isGoogleDomain = host.endsWith('.googlebot.com') || host.endsWith('.google.com');

      if (!isGoogleDomain) {
        return resolve({ verified: false, hostname: host });
      }

      // Forward lookup to verify
      dns.lookup(host, (lErr, resolvedIp) => {
        if (!lErr && resolvedIp === ip) {
          resolve({ verified: true, hostname: host });
        } else {
          resolve({ verified: false, hostname: host });
        }
      });
    });
  });
}

async function recordBotVisit(req, extra = {}) {
  const userAgent = req.headers['user-agent'] || '';
  const botInfo = identifyBot(userAgent);
  if (!botInfo) return null; // Not a recognized search bot

  const ip = getClientIp(req);
  const entry = {
    id: 'crawl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    bot: botInfo.name,
    isGoogle: botInfo.isGoogle,
    ip,
    method: req.method,
    path: req.url,
    userAgent,
    referer: req.headers['referer'] || null,
    verified: false,
    ...extra
  };

  // Perform background verification for Googlebot
  if (botInfo.isGoogle) {
    try {
      const { verified, hostname } = await verifyGooglebotIp(ip);
      entry.verified = verified;
      entry.reverseDns = hostname;
    } catch (e) {}
  }

  const logs = readBotLogs();
  logs.unshift(entry);
  writeBotLogs(logs);

  return entry;
}

function getBotStats() {
  const logs = readBotLogs();
  const totalHits = logs.length;
  const googleHits = logs.filter(l => l.isGoogle).length;
  const bingHits = logs.filter(l => l.bot && l.bot.includes('Bing')).length;

  const pathCounts = {};
  for (const log of logs) {
    pathCounts[log.path] = (pathCounts[log.path] || 0) + 1;
  }

  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }));

  const lastVisit = logs[0] ? logs[0].timestamp : null;

  return {
    totalHits,
    googleHits,
    bingHits,
    lastVisit,
    topPaths
  };
}

module.exports = {
  identifyBot,
  recordBotVisit,
  readBotLogs,
  getBotStats
};
