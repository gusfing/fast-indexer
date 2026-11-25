/**
 * Headless Chrome Browser Telemetry Simulator
 * Loads target URLs in headless Chrome to trigger analytics and browser signals.
 */

const path = require('path');

function getPlaywright() {
  const candidates = [
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', 'node_modules'),
    'c:/Users/ks209/Documents/kunal saas/kawaki website/files/node_modules',
    'C:\\Users\\ks209\\mcp-servers\\google-flow-browser-mcp'
  ];

  for (const dir of candidates) {
    try {
      return require(require.resolve('playwright', { paths: [dir] }));
    } catch (e) {}
  }
  return null;
}

async function visitUrlsWithChrome(urls = [], onLog = console.log) {
  if (!urls.length) {
    onLog('No URLs provided for browser telemetry.');
    return { visited: 0, failed: 0 };
  }

  const pw = getPlaywright();
  if (!pw) {
    onLog('[WARN] Playwright module not detected; skipping browser visit simulation.');
    return { visited: 0, failed: 0, skipped: true };
  }

  const { chromium } = pw;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (err) {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err2) {
      onLog(`[WARN] Could not launch Chrome headless: ${err2.message}`);
      return { visited: 0, failed: urls.length, error: err2.message };
    }
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();
  onLog(`Simulating organic browser visits for ${urls.length} URL(s)...`);

  let visited = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const status = response ? response.status() : 'OK';
      onLog(`   [VISITED] ${url} (HTTP ${status})`);
      visited++;
    } catch (err) {
      onLog(`   [WARN] ${url}: ${err.message}`);
      failed++;
    }
  }

  await browser.close();
  onLog(`Completed browser telemetry simulation: ${visited} visited, ${failed} warnings.`);
  return { visited, failed };
}

module.exports = { visitUrlsWithChrome };
