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
    'c:/Users/ks209/Documents/kunal saas/kawaki website/files/node_modules/googleapis'
  ];

  for (const dir of candidates) {
    try {
      return require(require.resolve('googleapis', { paths: [dir] }));
    } catch (e) {}
  }
  return null;
}

async function publishGoogleIndex(urls = [], onLog = console.log, concurrency = 5) {
  const gpkg = getGoogleapis();
  if (!gpkg) {
    throw new Error('googleapis module not found. Please install dependencies or ensure project node_modules is present.');
  }

  const { google } = gpkg;
  const keyFile = path.join(__dirname, '..', 'service-account.json');

  if (!fs.existsSync(keyFile)) {
    throw new Error('service-account.json not found in root directory.');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/indexing']
  });

  const authClient = await auth.getClient();
  const indexing = google.indexing({ version: 'v3', auth: authClient });

  onLog(`Authenticated with Google Cloud Service Account. Dispatching ${urls.length} URLs...`);

  const results = [];
  const total = urls.length;
  let index = 0;
  let published = 0;
  let failed = 0;

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const url = urls[currentIndex].trim();

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
        onLog(`   ⚠️ [Google Limit/Error] ${url}: ${errorMsg}`);
      }

      // Small pacing delay to avoid aggressive burst throttling
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
