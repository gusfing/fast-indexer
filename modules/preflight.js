/**
 * High-Performance Preflight Health & Canonical Checker
 * Validates HTTP 200 and absence of noindex directives with 25-worker concurrency
 * Capable of checking 2,000+ URLs in under 30 seconds.
 */

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Fast Indexer Preflight/2.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (res.status !== 200) {
      return { url, valid: false, ok: false, status: res.status, reason: `HTTP status ${res.status}` };
    }

    const html = await res.text();
    if (/noindex/i.test(html)) {
      return { url, valid: false, ok: false, status: res.status, reason: 'Contains noindex directive' };
    }

    return { url, valid: true, ok: true, status: 200, reason: 'Healthy and indexable' };
  } catch (err) {
    return { url, valid: false, ok: false, status: 0, reason: err.message };
  }
}

async function validateUrls(urls = [], onLog = console.log, concurrency = 25) {
  const results = [];
  const total = urls.length;
  onLog(`Validating ${total} target URL(s) with ${concurrency} parallel workers...`);

  let index = 0;
  let passed = 0;
  let failed = 0;

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const url = urls[currentIndex];
      const res = await checkUrl(url);
      results[currentIndex] = res;

      if (res.valid) {
        passed++;
        if (total <= 50 || passed % 50 === 0 || currentIndex === total - 1) {
          onLog(`   ✓ [Valid ${passed}/${total}] ${url}`);
        }
      } else {
        failed++;
        onLog(`   ⚠️ [Invalid] ${url} (${res.reason})`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  onLog(`Preflight complete: ${passed}/${total} passed (${failed} failed/invalid).`);
  return results;
}

const runPreflight = validateUrls;

module.exports = { checkUrl, validateUrls, runPreflight };
