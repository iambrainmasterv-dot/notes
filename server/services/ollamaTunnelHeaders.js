const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Extra fetch headers for tunnel providers that block plain API clients.
 * Named Cloudflare tunnels on your own domain usually do not need these.
 *
 * @param {string} ollamaBaseUrl - OLLAMA_BASE_URL value
 * @returns {Record<string, string>}
 */
export function ollamaFetchExtraHeaders(ollamaBaseUrl) {
  let hostname = '';
  try {
    const raw = String(ollamaBaseUrl || '').trim();
    if (!raw) return {};
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    hostname = u.hostname;
  } catch {
    return {};
  }

  if (/ngrok/i.test(hostname)) {
    return {
      'ngrok-skip-browser-warning': '1',
      'User-Agent': BROWSER_UA,
    };
  }

  // Quick tunnels (*.trycloudflare.com) often return 403 to default fetch/curl without a browser-like client.
  if (/\.trycloudflare\.com$/i.test(hostname)) {
    return {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  // https://localtunnel.github.io/www/ — reminder page; server-side fetch needs this + browser UA.
  if (/\.loca\.lt$/i.test(hostname)) {
    return {
      'Bypass-Tunnel-Reminder': 'true',
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    };
  }

  return {};
}
