import express from 'express';
import { runAlertCheck } from './alerts.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'portfolio-alert-worker', at: new Date().toISOString() });
});

app.post('/run-alert-check', async (req, res) => {
  const secret = process.env.ALERT_RUN_SECRET || '';
  const got = req.headers['x-alert-secret'];
  if (secret && got !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  try {
    const result = await runAlertCheck();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Alert API listening on ${port}`);
});
