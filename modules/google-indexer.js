/**
 * Google Rapid Indexing API Module
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

async function publishGoogleIndex(urls = [], onLog = console.log) {
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

  onLog(`Authenticated with Google Cloud Service Account`);

  const results = [];
  for (const url of urls) {
    try {
      const res = await indexing.urlNotifications.publish({
        requestBody: {
          url: url.trim(),
          type: 'URL_UPDATED'
        }
      });
      onLog(`[200 OK] Google crawl queued: ${url}`);
      results.push({ url, status: 200, success: true, metadata: res.data });
    } catch (err) {
      const errorMsg = err.response && err.response.data && err.response.data.error 
        ? err.response.data.error.message 
        : err.message;
      onLog(`[Google Error] ${url}: ${errorMsg}`);
      results.push({ url, status: err.code || 500, success: false, error: errorMsg });
    }
  }

  return results;
}

module.exports = { publishGoogleIndex };
