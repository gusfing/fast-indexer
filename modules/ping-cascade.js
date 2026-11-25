/**
 * Authoritative Multi-Hub RSS & XML-RPC Ping Cascade Module
 * Broadcasts feed updates to top global search engine RPC ping hubs and Google WebSub
 */

const http = require('http');
const https = require('https');

const DEFAULT_SITE_NAME = process.env.SITE_NAME || 'Fast Indexer';
const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://kawaki.co.in';
const DEFAULT_RSS_URL = process.env.RSS_URL || 'https://kawaki.co.in/rss.xml';

// Global Authoritative Ping Endpoints
const RPC_PING_HUBS = [
  { name: 'Ping-o-Matic Hub', host: 'rpc.pingomatic.com', path: '/', port: 80, https: false },
  { name: 'Twingly Ping', host: 'rpc.twingly.com', path: '/', port: 80, https: false },
  { name: 'Blo.gs Ping', host: 'ping.blo.gs', path: '/', port: 80, https: false },
  { name: 'WeblogUpdates', host: 'rpc.weblogs.com', path: '/RPC2', port: 80, https: false },
  { name: 'FC2 Ping', host: 'ping.fc2.com', path: '/', port: 80, https: false }
];

function sendXmlRpcPing(hub, siteName, siteUrl, rssUrl) {
  return new Promise((resolve) => {
    const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value>${siteName}</value></param>
    <param><value>${siteUrl}</value></param>
    <param><value>${rssUrl}</value></param>
  </params>
</methodCall>`;

    const requester = hub.https ? https : http;
    const req = requester.request({
      hostname: hub.host,
      port: hub.port,
      path: hub.path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xml),
        'User-Agent': 'Fast Indexer Multi-Ping/2.0'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // XML-RPC flerror: 0 indicates success, 1 indicates error
        const isOk = res.statusCode >= 200 && res.statusCode < 300 && (!data.includes('<boolean>1</boolean>') || data.includes('<boolean>0</boolean>'));
        resolve({ name: hub.name, host: hub.host, status: res.statusCode, success: isOk, feed: rssUrl });
      });
    });

    req.on('error', (err) => {
      resolve({ name: hub.name, host: hub.host, error: err.message, success: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ name: hub.name, host: hub.host, error: 'Timeout', success: false });
    });

    req.write(xml);
    req.end();
  });
}

function pingWebSubHub(rssUrl) {
  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      'hub.mode': 'publish',
      'hub.url': rssUrl
    }).toString();

    const req = https.request({
      hostname: 'pubsubhubbub.appspot.com',
      port: 443,
      path: '/publish',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Fast Indexer Publisher/2.0'
      },
      timeout: 12000
    }, (res) => {
      resolve({ name: 'Google WebSub Hub', host: 'pubsubhubbub.appspot.com', status: res.statusCode, success: res.statusCode >= 200 && res.statusCode < 300, feed: rssUrl });
    });

    req.on('error', (err) => {
      resolve({ name: 'Google WebSub Hub', host: 'pubsubhubbub.appspot.com', error: err.message, success: false });
    });

    req.write(postData);
    req.end();
  });
}

async function runPingCascade(onLog = console.log, customFeedUrl = null, siteName = DEFAULT_SITE_NAME, siteUrl = DEFAULT_SITE_URL) {
  const targetFeedUrl = customFeedUrl || DEFAULT_RSS_URL;
  onLog(`Dispatching multi-hub broadcast cascade for feed: ${targetFeedUrl}`);

  const results = [];

  // 1. Google WebSub Official Hub
  const websub = await pingWebSubHub(targetFeedUrl);
  results.push(websub);
  onLog(`   ${websub.success ? '✓ [OK]' : '⚠️ [WARN]'} ${websub.name}: HTTP ${websub.status || websub.error}`);

  // 2. Multi-hub XML-RPC pings in parallel
  const pingPromises = RPC_PING_HUBS.map(hub => sendXmlRpcPing(hub, siteName, siteUrl, targetFeedUrl));
  const rpcResults = await Promise.all(pingPromises);

  for (const r of rpcResults) {
    results.push(r);
    onLog(`   ${r.success ? '✓ [OK]' : '⚠️ [WARN]'} ${r.name}: Status ${r.status || r.error}`);
  }

  const successCount = results.filter(r => r.success).length;
  onLog(`Cascade completed: ${successCount}/${results.length} search engine hubs acknowledged.`);

  return { results, successCount, total: results.length, feedUrl: targetFeedUrl };
}

module.exports = { runPingCascade };
