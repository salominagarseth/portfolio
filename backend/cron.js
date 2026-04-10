import { runAlertCheck } from './alerts.js';

async function main() {
  try {
    const result = await runAlertCheck();
    console.log(JSON.stringify({
      ok: true,
      time: new Date().toISOString(),
      result,
    }));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      time: new Date().toISOString(),
      error: err?.message || String(err),
    }));
    process.exit(1);
  }
}

main();
