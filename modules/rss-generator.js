/**
 * Isolated RSS Feed Generator Module
 * Creates separate, self-contained RSS 2.0 XML feeds for target URL batches.
 */

const fs = require('fs');
const path = require('path');

const FEEDS_DIR = path.join(__dirname, '..', 'data', 'feeds');

function ensureFeedsDir() {
  if (!fs.existsSync(FEEDS_DIR)) {
    fs.mkdirSync(FEEDS_DIR, { recursive: true });
  }
}

function escapeXml(unsafe = '') {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRfc822Date(date = new Date()) {
  return date.toUTCString();
}

function generateRssXml(urls = [], options = {}) {
  const title = options.title || 'Rapid URL Indexing Feed';
  const description = options.description || 'Isolated RSS syndication feed for fast search engine crawl discovery';
  const siteUrl = options.siteUrl || (urls[0] ? new URL(urls[0]).origin : 'https://fast-indexer.local');
  const feedUrl = options.feedUrl || `${siteUrl}/rss/latest.xml`;
  const pubDate = formatRfc822Date(options.pubDate || new Date());

  const itemsXml = urls.map((url, index) => {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      urlObj = { pathname: `item-${index + 1}` };
    }

    const cleanPath = urlObj.pathname.replace(/^\/|\/$/g, '').replace(/[-_]/g, ' ') || 'Home';
    const itemTitle = cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);

    return `    <item>
      <title>${escapeXml(itemTitle)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(`Indexing priority update for ${url}`)}</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

function saveIsolatedFeed(feedId, urls = [], options = {}) {
  ensureFeedsDir();
  const xml = generateRssXml(urls, options);
  const feedPath = path.join(FEEDS_DIR, `${feedId}.xml`);
  const latestPath = path.join(FEEDS_DIR, 'latest.xml');

  fs.writeFileSync(feedPath, xml, 'utf8');
  fs.writeFileSync(latestPath, xml, 'utf8');

  // Record feed metadata
  const metaPath = path.join(FEEDS_DIR, 'feeds-index.json');
  let feedsList = [];
  try {
    if (fs.existsSync(metaPath)) {
      feedsList = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch (e) {}

  feedsList.unshift({
    feedId,
    createdAt: new Date().toISOString(),
    urlCount: urls.length,
    sampleUrl: urls[0] || '',
    feedPath: `/rss/${feedId}.xml`
  });

  fs.writeFileSync(metaPath, JSON.stringify(feedsList.slice(0, 50), null, 2), 'utf8');

  return { feedId, xml, feedPath: `/rss/${feedId}.xml` };
}

function saveChunkedFeeds(batchId, urls = [], options = {}, chunkSize = 100) {
  ensureFeedsDir();
  // 1. Save master feed
  const master = saveIsolatedFeed(batchId, urls, options);
  
  // 2. If URLs > chunkSize, create chunked feeds for crawler syndication
  const chunkFeeds = [];
  if (urls.length > chunkSize) {
    const totalChunks = Math.ceil(urls.length / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
      const slice = urls.slice(i * chunkSize, (i + 1) * chunkSize);
      const chunkId = `${batchId}_part${i + 1}`;
      const chunkFeedUrl = options.feedUrl 
        ? options.feedUrl.replace(`${batchId}.xml`, `${chunkId}.xml`)
        : `/rss/${chunkId}.xml`;

      const chunkResult = saveIsolatedFeed(chunkId, slice, {
        ...options,
        title: `${options.title || 'Rapid Index Batch'} [Part ${i + 1}/${totalChunks}]`,
        feedUrl: chunkFeedUrl
      });

      chunkFeeds.push({
        chunkId,
        urlCount: slice.length,
        feedUrl: chunkFeedUrl,
        sampleStart: i * chunkSize + 1,
        sampleEnd: i * chunkSize + slice.length
      });
    }
  }

  return { master, chunkFeeds };
}

function getFeedXml(feedId) {
  ensureFeedsDir();
  const filename = feedId === 'latest' ? 'latest.xml' : `${feedId}.xml`;
  const feedPath = path.join(FEEDS_DIR, filename);

  if (fs.existsSync(feedPath)) {
    return fs.readFileSync(feedPath, 'utf8');
  }

  // Fallback for latest.xml if no batch created yet
  if (feedId === 'latest') {
    const coreUrlsPath = path.join(__dirname, '..', 'data', 'core-urls.json');
    let defaultUrls = [];
    try {
      if (fs.existsSync(coreUrlsPath)) {
        defaultUrls = JSON.parse(fs.readFileSync(coreUrlsPath, 'utf8'));
      }
    } catch (e) {}
    if (defaultUrls.length) {
      const xml = generateRssXml(defaultUrls, { title: 'Default Feed' });
      fs.writeFileSync(feedPath, xml, 'utf8');
      return xml;
    }
  }

  return null;
}

function listFeeds() {
  ensureFeedsDir();
  const metaPath = path.join(FEEDS_DIR, 'feeds-index.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch (e) {}
  return [];
}

module.exports = {
  generateRssXml,
  saveIsolatedFeed,
  saveChunkedFeeds,
  getFeedXml,
  listFeeds
};
