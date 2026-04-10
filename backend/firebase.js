import admin from 'firebase-admin';

let _db = null;

function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing');
  }
  return JSON.parse(raw);
}

export function getDb() {
  if (_db) return _db;
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccountFromEnv();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  _db = admin.firestore();
  return _db;
}

export async function loadHoldings() {
  const db = getDb();
  const snap = await db.collection('portfolio').doc('holdings').get();
  if (!snap.exists) return [];
  const dataStr = snap.data()?.data;
  if (!dataStr) return [];
  const parsed = JSON.parse(dataStr);
  return Array.isArray(parsed) ? parsed : [];
}

export async function loadAlertConfig() {
  const db = getDb();
  const snap = await db.collection('portfolio').doc('alert_config').get();
  if (!snap.exists) {
    return {
      enabled: false,
      email: process.env.ALERT_EMAIL_TO || '',
      tolerancePct: 5,
    };
  }
  const d = snap.data() || {};
  return {
    enabled: !!d.enabled,
    email: String(d.email || process.env.ALERT_EMAIL_TO || '').trim(),
    tolerancePct: Number(d.tolerancePct) > 0 ? Number(d.tolerancePct) : 5,
  };
}

export async function loadAlertState() {
  const db = getDb();
  const snap = await db.collection('portfolio').doc('alert_state').get();
  if (!snap.exists) return {};
  const d = snap.data() || {};
  return d.state && typeof d.state === 'object' ? d.state : {};
}

export async function saveAlertState(nextState, summary) {
  const db = getDb();
  await db.collection('portfolio').doc('alert_state').set({
    state: nextState,
    summary,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}
