import { fetchOnePrice, normalizeSymbol } from './prices.js';
import { loadAlertConfig, loadAlertState, loadHoldings, saveAlertState } from './firebase.js';

function buildHoldingKey(h) {
  const target = Number(h.targetPrice);
  return `${normalizeSymbol(h.symbol)}|${h.account || 'NA'}|${Number.isFinite(target) ? target.toFixed(2) : '0'}`;
}

function getZone(ltp, target, tolerancePct) {
  if (!Number.isFinite(ltp) || !Number.isFinite(target) || target <= 0) return null;
  const diffPct = ((ltp - target) / target) * 100;
  if (ltp >= target) return 'reached';
  if (Math.abs(diffPct) <= tolerancePct) return 'near';
  return null;
}

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.ALERT_EMAIL_FROM || 'Portfolio Alerts <onboarding@resend.dev>';
  if (!apiKey) throw new Error('RESEND_API_KEY is missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
}

function buildMessage(h, ltp, zone, target, tolerancePct) {
  const diffPct = ((ltp - target) / target) * 100;
  const zoneLabel = zone === 'reached' ? 'TARGET REACHED' : `WITHIN +/-${tolerancePct}%`;
  const subject = `${zoneLabel}: ${h.symbol}`;
  const text = [
    `Stock: ${h.symbol} (${h.name || h.symbol})`,
    `Account: ${h.account || '-'}`,
    `Call: ${h.call || 'Hold'}`,
    `LTP: ${ltp.toFixed(2)}`,
    `Target: ${target.toFixed(2)}`,
    `Distance: ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`,
    `Triggered: ${new Date().toLocaleString('en-IN')}`,
  ].join('\n');
  return { subject, text };
}

export async function runAlertCheck() {
  const [holdings, cfg, prevState] = await Promise.all([
    loadHoldings(),
    loadAlertConfig(),
    loadAlertState(),
  ]);

  const tolerancePct = Number(cfg.tolerancePct) > 0 ? Number(cfg.tolerancePct) : 5;
  const nextState = { ...prevState };
  const unavailable = [];
  const sent = [];
  let checked = 0;

  if (!cfg.enabled || !cfg.email) {
    await saveAlertState(nextState, {
      enabled: false,
      checked,
      sent: 0,
      unavailable: 0,
      reason: 'Alerts disabled or email missing',
    });
    return { enabled: false, checked, sent: [], unavailable };
  }

  const candidates = holdings.filter((h) => Number(h.targetPrice) > 0 && Number(h.qty) > 0);
  for (const h of candidates) {
    checked++;
    const symbol = normalizeSymbol(h.symbol);
    const p = await fetchOnePrice(symbol);
    await new Promise((r) => setTimeout(r, 140));
    if (!p?.ltp) {
      unavailable.push(symbol);
      continue;
    }

    const target = Number(h.targetPrice);
    const zone = getZone(Number(p.ltp), target, tolerancePct);
    const key = buildHoldingKey(h);
    const prev = nextState[key] || null;

    if (!zone) {
      delete nextState[key];
      continue;
    }

    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const shouldSend = !prev || prev.zone !== zone || (now - Number(prev.sentAt || 0) > cooldownMs);
    if (!shouldSend) continue;

    const msg = buildMessage(h, Number(p.ltp), zone, target, tolerancePct);
    await sendEmail({ to: cfg.email, subject: msg.subject, text: msg.text });
    nextState[key] = { zone, sentAt: now, ltp: Number(p.ltp), target };
    sent.push({ symbol, zone, ltp: Number(p.ltp), target });
  }

  await saveAlertState(nextState, {
    enabled: true,
    checked,
    sent: sent.length,
    unavailable: unavailable.length,
    ranAt: new Date().toISOString(),
  });

  return { enabled: true, checked, sent, unavailable };
}
