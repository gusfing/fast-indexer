/**
 * High-Throughput Google Rapid Indexing API Module
 * Uses Google Cloud Service Account with managed worker concurrency
 */

const fs = require('fs');
const path = require('path');

function getGoogleapis() {
  const candidates = [
    path.join(__dirname, '..'),
    path.join(__dirname, '..', 'node_modules'),
    'c:/Users/ks209/Documents/kunal saas/kawaki website/files/node_modules/googleapis',
    'c:/Users/ks209/Documents/kunal saas/kawaki website/files'
  ];

  for (const dir of candidates) {
    try {
      return require(require.resolve('googleapis', { paths: [dir] }));
    } catch (e) {}
  }
  return null;
}

function resolveKeyFile() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, '..', 'service-account.json'),
    'c:/Users/ks209/Documents/kunal saas/kawaki website/files/service-account.json'
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function publishGoogleIndex(urls = [], onLog = console.log, concurrency = 5) {
  const gpkg = getGoogleapis();
  if (!gpkg) {
    throw new Error('googleapis module not found. Please install dependencies or ensure node_modules is present.');
  }

  const { google } = gpkg;
  const keyFile = resolveKeyFile();

  if (!keyFile) {
    throw new Error('Google service-account.json credential file not found.');
  }

  let clientEmail = 'Service Account';
  try {
    const rawKey = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    if (rawKey.client_email) clientEmail = rawKey.client_email;
  } catch (e) {}

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/indexing']
  });

  const authClient = await auth.getClient();
  const indexing = google.indexing({ version: 'v3', auth: authClient });

  onLog(`Authenticated with Google Service Account: ${clientEmail}`);
  onLog(`Dispatching ${urls.length} URLs across worker pool (concurrency: ${concurrency})...`);

  const results = [];
  const total = urls.length;
  let index = 0;
  let published = 0;
  let failed = 0;

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const url = urls[currentIndex].trim();
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch (e) {}

      try {
        const res = await indexing.urlNotifications.publish({
          requestBody: {
            url,
            type: 'URL_UPDATED'
          }
        });

        published++;
        results[currentIndex] = { url, status: 200, success: true, metadata: res.data };
        if (total <= 30 || published % 25 === 0 || currentIndex === total - 1) {
          onLog(`   ✓ [200 OK] Google crawl queued (${published}/${total}): ${url}`);
        }
      } catch (err) {
        failed++;
        const errorMsg = err.response && err.response.data && err.response.data.error 
          ? err.response.data.error.message 
          : err.message;
        results[currentIndex] = { url, status: err.code || 500, success: false, error: errorMsg };
        
        if (errorMsg.includes('Permission denied') || errorMsg.includes('403') || errorMsg.includes('ownership')) {
          onLog(`   ⚠️ [Google 403 Forbidden] ${url}`);
          onLog(`      ↳ Reason: ${errorMsg}`);
          onLog(`      ↳ Action needed: In Google Search Console for '${hostname}', go to Settings > Users & Permissions and add '${clientEmail}' as an 'Owner'.`);
        } else {
          onLog(`   ⚠️ [Google API Error] ${url}: ${errorMsg}`);
        }
      }

      // Micro pacing delay
      if (concurrency > 1) {
        await new Promise(r => setTimeout(r, 40));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  onLog(`Google API Complete: ${published} published, ${failed} failed.`);
  return results;
}

module.exports = { publishGoogleIndex };
