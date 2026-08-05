// Self-contained end-to-end verification of the admin impersonation flow
// against keepintax_prodcopy. Point it at a backend booted with
// NODE_ENV=production, DB_DATABASE=keepintax_prodcopy, SKIP_BOOT_SEED=true
// (see docs/redesign/qa-access.md) — defaults to port 3001 so it doesn't
// collide with a normal dev server on 3000. Mints the Firebase ID token
// IN-MEMORY and never logs it or writes it to disk — only masked
// identifiers and response summaries are printed.
require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3001';
// Dev Firebase project's public Web API key (same one committed in
// frontend/src/environments/environment.ts — not a secret, Web API keys are
// client-exposed by design; only identifies which Firebase project to hit).
const DEV_WEB_API_KEY = 'AIzaSyClSnN3fRAb9aQVt2kMEkLygsNExwQD7fo';
const QA_UID = 'LiVlGGxaC0hefnmw5LinOZvbjvc2';

// Real client firebaseIds/businessNumbers are NOT duplicated into this script —
// derived at runtime from the already-committed baseline fixture index instead,
// grouped by owning firebaseId (one client can own more than one baseline business).
const BASELINE_INDEX_PATH = path.join(
  __dirname, '..', '..', '..', 'docs', 'redesign', 'baseline-reports-post-migration', 'index.json',
);

function loadBaselineClients() {
  const index = JSON.parse(fs.readFileSync(BASELINE_INDEX_PATH, 'utf8'));
  const byFirebaseId = new Map();
  for (const b of index.businesses) {
    if (!byFirebaseId.has(b.firebaseId)) byFirebaseId.set(b.firebaseId, []);
    byFirebaseId.get(b.firebaseId).push(b.businessNumber);
  }
  return Array.from(byFirebaseId, ([firebaseId, businessNumbers]) => ({ firebaseId, businessNumbers }));
}

function mask(id) {
  return id && id.length >= 8 ? id.substring(0, 8) + '...' : '?';
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

async function getIdToken() {
  const customToken = await admin.auth().createCustomToken(QA_UID);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${DEV_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.idToken;
}

async function main() {
  const idToken = await getIdToken();
  console.log(`[verify] Got ID token for QA admin uid=${mask(QA_UID)} (not printed).`);

  // 1. Sign in as the QA admin itself.
  const signinRes = await fetch(`${BASE_URL}/auth/signin?freshLogin=true`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const signinBody = await signinRes.json();
  console.log(`\n[1/3] GET /auth/signin -> ${signinRes.status}`);
  if (signinRes.ok) {
    console.log(`  role=${JSON.stringify(signinBody.role)} businessStatus=${signinBody.businessStatus} businessNumber=${signinBody.businessNumber}`);
  } else {
    console.log('  BODY:', JSON.stringify(signinBody));
  }

  // 2. List all users (admin-only endpoint).
  const allUsersRes = await fetch(`${BASE_URL}/auth/all-users`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const allUsersBody = await allUsersRes.json();
  console.log(`\n[2/3] GET /auth/all-users -> ${allUsersRes.status}, count=${Array.isArray(allUsersBody) ? allUsersBody.length : 'n/a'}`);
  if (Array.isArray(allUsersBody)) {
    const qaRow = allUsersBody.find(u => u.firebaseId === QA_UID);
    console.log(`  QA row present in list: ${!!qaRow}, fName="${qaRow?.fName}"`);
  } else {
    console.log('  BODY:', JSON.stringify(allUsersBody));
  }

  // 3. Impersonate each of the 9 baseline businesses' owning clients via x-client-user-id.
  const baselineClients = loadBaselineClients();
  console.log('\n[3/3] Impersonation via x-client-user-id (admin bypass, no delegation row):');
  let allOk = true;
  for (const client of baselineClients) {
    const res = await fetch(`${BASE_URL}/business/get-businesses`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        'x-client-user-id': client.firebaseId,
      },
    });
    const body = await res.json();
    const gotNumbers = Array.isArray(body) ? body.map(b => b.businessNumber).sort() : null;
    // Subset check, not exact-match: a client may legitimately own additional
    // businesses outside the 9-business baseline fixture set.
    const matches = res.ok && client.businessNumbers.every(n => gotNumbers?.includes(n));
    if (!matches) allOk = false;
    console.log(`  ${mask(client.firebaseId)} -> ${res.status}, businessNumbers=${JSON.stringify(gotNumbers)} expected(subset)=${JSON.stringify(client.businessNumbers)} ${matches ? 'OK' : 'MISMATCH'}`);
  }

  console.log(`\n=== ${allOk ? 'ALL IMPERSONATION CHECKS PASSED' : 'SOME CHECKS FAILED'} ===`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
