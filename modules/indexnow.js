/**
 * IndexNow Protocol Module (Bing, Yandex, Seznam, Naver)
 * Supports custom verification keys, auto-derived hostnames, and bulk submissions up to 10,000 URLs.
 */

const DEFAULT_KEY = process.env.INDEXNOW_KEY || '262ab81b1de8469b20c5678a83f31ba5';
const DEFAULT_HOST = process.env.SITE_HOST || 'kawaki.co.in';

async function submitIndexNow(urls = [], onLog = console.log, customKey = null, customHost = null) {
  if (!urls.length) return { success: false, message: 'No URLs provided' };

  const key = customKey || DEFAULT_KEY;
  let host = customHost;

  if (!host && urls[0]) {
    try {
      host = new URL(urls[0]).hostname;
    } catch (e) {}
  }
  if (!host) host = DEFAULT_HOST;

  const keyLocation = `https://${host}/${key}.txt`;
  onLog(`[IndexNow] Preparing payload for ${urls.length} URL(s) under host: ${host} (Key: ${key.slice(0, 8)}...)`);

  // Endpoints: Primary IndexNow Hub & Bing IndexNow
  const endpoints = [
    { name: 'IndexNow Central Hub', url: 'https://api.indexnow.org/indexnow' },
    { name: 'Bing IndexNow', url: 'https://www.bing.com/indexnow' }
  ];

  const payload = {
    host,
    key,
    keyLocation,
    urlList: urls
  };

  let anySuccess = false;
  let lastStatus = 0;
  let lastError = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });

      lastStatus = res.status;
      if (res.status === 200 || res.status === 202) {
        onLog(`   ✓ [${ep.name}] HTTP ${res.status} Accepted: ${urls.length} URL(s) queued for crawl.`);
        anySuccess = true;
      } else {
        const txt = await res.text();
        onLog(`   ⚠️ [${ep.name}] HTTP ${res.status}: ${txt || 'Non-200 response'}`);
        if (txt && txt.includes('InvalidRequestParameters')) {
          onLog(`      ↳ Notice: Search engines require ${keyLocation} to exist on '${host}'.`);
          onLog(`      ↳ (Verified on kawaki.co.in. For other domains, create /${key}.txt returning '${key}').`);
        }
        lastError = txt;
      }
    } catch (err) {
      onLog(`   ⚠️ [${ep.name}] Error: ${err.message}`);
      lastError = err.message;
    }
  }

  return {
    success: anySuccess,
    status: lastStatus,
    count: urls.length,
    host,
    key: key.slice(0, 8) + '...',
    error: anySuccess ? null : lastError
  };
}

module.exports = { submitIndexNow };
