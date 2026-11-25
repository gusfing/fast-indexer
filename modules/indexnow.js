/**
 * IndexNow Protocol Module (Bing, Yandex, Seznam, Naver)
 */

const KEY = '262ab81b1de8469b20c5678a83f31ba5';
const HOST = 'kawaki.co.in';

async function submitIndexNow(urls = [], onLog = console.log) {
  if (!urls.length) return { success: false, message: 'No URLs provided' };

  onLog(`Submitting ${urls.length} URL(s) to IndexNow endpoint (Bing/IndexNow network)...`);

  try {
    const res = await fetch('https://www.bing.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList: urls
      }),
      signal: AbortSignal.timeout(15000)
    });

    const isOk = res.status === 200 || res.status === 202;
    if (isOk) {
      onLog(`[IndexNow OK] HTTP ${res.status} Accepted: ${urls.length} URL(s) queued for crawl.`);
      return { success: true, status: res.status, count: urls.length };
    } else {
      const txt = await res.text();
      onLog(`[IndexNow Failed] HTTP ${res.status}: ${txt}`);
      return { success: false, status: res.status, error: txt };
    }
  } catch (err) {
    onLog(`[IndexNow Network Error]: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { submitIndexNow };
