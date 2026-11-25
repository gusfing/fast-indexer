const fs = require('fs');
const path = require('path');
const { generateRssFeed } = require('../modules/rss-generator');

const baseDir = path.resolve(__dirname, '..');

// 1. Delete bulk_test files from feeds
const feedsDir = path.join(baseDir, 'data', 'feeds');
if (fs.existsSync(feedsDir)) {
  const files = fs.readdirSync(feedsDir);
  for (const f of files) {
    if (f.startsWith('bulk_test_')) {
      fs.unlinkSync(path.join(feedsDir, f));
      console.log('Deleted feed:', f);
    }
  }
}

// 2. Clean feeds-index.json
const idxPath = path.join(baseDir, 'data', 'feeds', 'feeds-index.json');
if (fs.existsSync(idxPath)) {
  let idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  idx = idx.filter(f => {
    const fid = f.feedId || f.batchId || f.file || '';
    return !fid.startsWith('bulk_test_');
  });
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  console.log('Cleaned feeds-index.json, remaining entries:', idx.length);
}

// 3. Clean history.json
const histPath = path.join(baseDir, 'data', 'history.json');
if (fs.existsSync(histPath)) {
  let hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
  hist = hist.filter(h => {
    const bId = h.batchId || '';
    const id = h.id || '';
    return !bId.startsWith('bulk_test_') && !id.startsWith('bulk_test_') && (h.totalUrls < 500);
  });
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 2));
  console.log('Cleaned history.json, remaining entries:', hist.length);
}

// 4. Regenerate clean latest.xml using core URLs
try {
  const coreUrlsPath = path.join(baseDir, 'data', 'core-urls.json');
  if (fs.existsSync(coreUrlsPath)) {
    const coreUrls = JSON.parse(fs.readFileSync(coreUrlsPath, 'utf8'));
    const rssXml = generateRssFeed(coreUrls, 'Kawaki Studios - Primary RSS Feed');
    fs.writeFileSync(path.join(feedsDir, 'latest.xml'), rssXml, 'utf8');
    console.log('Regenerated data/feeds/latest.xml from core-urls.json');
  }
} catch (e) {
  console.error('Error regenerating latest.xml:', e.message);
}

console.log('Local test batches successfully wiped.');
