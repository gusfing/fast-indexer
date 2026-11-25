/**
 * RSS & XML-RPC Ping Cascade Module
 * Dispatches feed notification pings to Ping-o-Matic and Google WebSub Hub
 * Supports custom, isolated RSS feed URLs per indexing batch.
 */

const http = require('http');
const https = require('https');

const DEFAULT_SITE_NAME = process.env.SITE_NAME || 'Fast Indexer';
const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://kawaki.co.in';
const DEFAULT_RSS_URL = process.env.RSS_URL || 'https://kawaki.co.in/rss.xml';

function sendXmlRpcPing(hostname, path = '/', port = 80, siteName = DEFAULT_SITE_NAME, siteUrl = DEFAULT_SITE_URL, rssUrl = DEFAULT_RSS_URL) {
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

    const req = http.request({
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xml),
        'User-Agent': 'Fast Indexer Ping Agent/1.0'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const isOk = !data.includes('<boolean>1</boolean>') || data.includes('<boolean>0</boolean>');
        resolve({ host: hostname, status: res.statusCode, success: isOk, feed: rssUrl });
      });
    });

    req.on('error', (err) => {
      resolve({ host: hostname, error: err.message, success: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ host: hostname, error: 'Timeout', success: false });
    });

    req.write(xml);
    req.end();
  });
}

function pingWebSubHub(rssUrl = DEFAULT_RSS_URL) {
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
        'User-Agent': 'Fast Indexer Publisher/1.0'
      },
      timeout: 10000
    }, (res) => {
      resolve({ host: 'pubsubhubbub.appspot.com', status: res.statusCode, success: res.statusCode >= 200 && res.statusCode < 300, feed: rssUrl });
    });

    req.on('error', (err) => {
      resolve({ host: 'pubsubhubbub.appspot.com', error: err.message, success: false });
    });

    req.write(postData);
    req.end();
  });
}

async function runPingCascade(onLog = console.log, customFeedUrl = null, siteName = DEFAULT_SITE_NAME, siteUrl = DEFAULT_SITE_URL) {
  const targetFeedUrl = customFeedUrl || DEFAULT_RSS_URL;
  onLog(`Dispatching XML-RPC & WebSub feed pings for feed: ${targetFeedUrl}`);
  
  const pingomatic = await sendXmlRpcPing('rpc.pingomatic.com', '/', 80, siteName, siteUrl, targetFeedUrl);
  onLog(`   ${pingomatic.success ? '[OK]' : '[WARN]'} Ping-o-Matic status: ${pingomatic.status || pingomatic.error}`);

  const websub = await pingWebSubHub(targetFeedUrl);
  onLog(`   ${websub.success ? '[OK]' : '[WARN]'} Google WebSub Hub status: ${websub.status || websub.error}`);

  return { pingomatic, websub, feedUrl: targetFeedUrl };
}

module.exports = { runPingCascade };
