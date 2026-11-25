/**
 * Preflight Health & Canonical Checker Module
 */

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
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

async function validateUrls(urls = [], onLog = console.log) {
  const results = [];
  for (const url of urls) {
    const res = await checkUrl(url);
    if (res.valid) {
      onLog(`   ✓ [Valid] ${url}`);
    } else {
      onLog(`   ⚠️ [Invalid] ${url} (${res.reason})`);
    }
    results.push(res);
  }
  return results;
}

const runPreflight = validateUrls;

module.exports = { checkUrl, validateUrls, runPreflight };
