const SYMBOL_OVERRIDES = {
  CANARABANK: 'CANBK',
  BANKOF: 'BANKBARODA',
  EMSLIMITED: 'EMS',
  ETHOSLIMIT: 'ETHOSLTD',
  ZENTECHNOL: 'ZENTEC',
  SHYAMMETAL: 'SHYAMMETL',
};

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function normalizeSymbol(symbol) {
  const raw = String(symbol || '')
    .toUpperCase()
    .trim()
    .replace(/\.NS$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9&-]/g, '');
  return SYMBOL_OVERRIDES[raw] || raw;
}

function parseNseViaJinaText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseNseQuotePayload(payload) {
  const info = payload?.priceInfo || {};
  const ltp = toNum(info.lastPrice);
  if (ltp === null) return null;
  const prev = toNum(info.previousClose);
  const pChange = toNum(info.pChange);
  return {
    ltp,
    prev,
    dayChgPct: pChange !== null ? pChange : (prev ? ((ltp - prev) / prev * 100) : 0),
  };
}

async function fetchFromNseProxy(symbol) {
  const url = `https://r.jina.ai/http://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`NSE proxy HTTP ${r.status}`);
  const raw = await r.text();
  const payload = parseNseViaJinaText(raw);
  if (!payload) throw new Error('NSE proxy parse failed');
  return parseNseQuotePayload(payload);
}

export async function fetchOnePrice(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return null;
  for (let tries = 0; tries < 3; tries++) {
    try {
      const p = await fetchFromNseProxy(sym);
      if (p && p.ltp) return p;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
  }
  return null;
}
