/* ==========================================================================
   Sentinel Recovery — intake API and admin dashboard
   Zero runtime dependencies. Requires Node 22.5+ for node:sqlite.
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/* ---------- Configuration ---------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Sentinel Recovery <onboarding@resend.dev>';
const IP_SALT = process.env.IP_SALT || crypto.randomBytes(24).toString('hex');
const MAX_BODY = 32 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const SESSION_MS = 8 * 60 * 60 * 1000;

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

/* ---------- Database ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'sentinel.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT UNIQUE NOT NULL,
    client_case_id TEXT,
    created_at TEXT NOT NULL,
    submitted_at TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    scam_type TEXT,
    incident_date TEXT,
    amount TEXT,
    currency TEXT,
    payment_methods TEXT,
    description TEXT,
    suspect_details TEXT,
    platform TEXT,
    reported_to TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    country TEXT,
    contact_preference TEXT,
    support_needs TEXT,
    contact_safety TEXT,
    referral TEXT,
    consents TEXT,
    ip_hash TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    name TEXT,
    email TEXT,
    topic TEXT,
    message TEXT,
    ip_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS status_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    case_id TEXT,
    email TEXT,
    matched INTEGER NOT NULL DEFAULT 0,
    ip_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

/* ---------- Helpers ---------- */
const now = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded ? String(forwarded).split(',')[0].trim() : req.socket.remoteAddress || '';
  return sha256(raw + '|' + IP_SALT);
}

const rateHits = new Map();
function rateLimited(key, limit, windowMs) {
  const t = Date.now();
  const previous = (rateHits.get(key) || []).filter((x) => t - x < windowMs);
  if (previous.length >= limit) {
    rateHits.set(key, previous);
    return true;
  }
  previous.push(t);
  rateHits.set(key, previous);
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) if (!v.length || t - v[v.length - 1] > windowMs) rateHits.delete(k);
  }
  return false;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) return { 'Access-Control-Allow-Origin': '*' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return {};
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  };
}

function send(res, status, body, headers = {}, req = null) {
  const isRaw = Buffer.isBuffer(body);
  const payload = isRaw ? body : (typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': isRaw ? 'application/octet-stream' : (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'),
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...(req ? corsHeaders(req) : {}),
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, obj, req, headers = {}) {
  send(res, status, obj, headers, req);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString('utf8'));
}

async function sendEmail(to, subject, text) {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function makeCaseId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
    const id = `SR-${new Date().getFullYear()}-${suffix}`;
    if (!db.prepare('SELECT 1 FROM cases WHERE case_id = ?').get(id)) return id;
  }
  throw new Error('Unable to allocate case reference');
}

/* ---------- Admin authentication ---------- */
function ensureAdminSecret() {
  if (getSetting('admin_salt')) return;
  const salt = crypto.randomBytes(16).toString('hex');
  const configured = process.env.ADMIN_PASSWORD;
  const password = configured && configured.length >= 12
    ? configured
    : crypto.randomBytes(12).toString('base64url');
  setSetting('admin_salt', salt);
  setSetting('admin_hash', hashPassword(password, salt));
  if (!configured) {
    console.log('\n=========================================');
    console.log('ADMIN PASSWORD (shown once): ' + password);
    console.log('Save it now. It is not recoverable.');
    console.log('=========================================\n');
  }
}
ensureAdminSecret();

function verifyAdminPassword(password) {
  const salt = getSetting('admin_salt');
  const hash = getSetting('admin_hash');
  if (!salt || !hash || typeof password !== 'string') return false;
  const supplied = Buffer.from(hashPassword(password, salt), 'hex');
  const stored = Buffer.from(hash, 'hex');
  return supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
}

function createSession() {
  const token = randomToken();
  const hash = sha256(token);
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .run(hash, now(), new Date(Date.now() + SESSION_MS).toISOString());
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  return token;
}

function sessionFromReq(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)sr_admin=([^;]+)/);
  if (!match) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(sha256(match[1]), now());
  return row || null;
}

function cookieHeader(token) {
  const secure = BASE_URL.startsWith('https://') ? '; Secure' : '';
  return `sr_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.round(SESSION_MS / 1000)}${secure}`;
}

/* ---------- Validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.txt', '.eml', '.msg', '.csv']);

function cleaned(value, max = 5000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function validateReport(fields) {
  const errors = [];
  const email = cleaned(fields.email, 254);
  const date = cleaned(fields.incidentDate, 20);
  const description = cleaned(fields.description, 5000);

  if (!cleaned(fields.fullName, 120)) errors.push('Name is required.');
  if (!EMAIL_RE.test(email)) errors.push('A valid email address is required.');
  if (!cleaned(fields.country, 120)) errors.push('Country is required.');
  if (!cleaned(fields.scamType, 120)) errors.push('Scam type is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Incident date is required.');
  else if (new Date(date) > new Date(Date.now() + 86400000)) errors.push('Incident date cannot be in the future.');
  if (description.length < 40) errors.push('Description must be at least 40 characters.');
  for (const key of ['accurate', 'privacyConsent', 'noGuarantee']) {
    if (!['on', 'true', 'yes', '1'].includes(String(fields[key] || '').toLowerCase())) {
      errors.push(`Missing required confirmation: ${key}.`);
    }
  }
  return { errors, email, date, description };
}

/* ---------- Static admin assets ---------- */
const STATIC_FILES = {
  '/admin': { file: 'admin.html', type: 'text/html; charset=utf-8' },
  '/admin/': { file: 'admin.html', type: 'text/html; charset=utf-8' },
  '/admin-app.js': { file: 'admin-app.js', type: 'text/javascript; charset=utf-8' },
  '/admin-styles.css': { file: 'admin-styles.css', type: 'text/css; charset=utf-8' },
  '/admin-styles': { file: 'admin-styles.css', type: 'text/css; charset=utf-8' },
};

function serveStatic(res, file, type) {
  const full = path.join(__dirname, file);
  if (!fs.existsSync(full)) return send(res, 404, 'Not found', {}, null);
  send(res, 200, fs.readFileSync(full), { 'Content-Type': type }, null);
}

/* ---------- Routes ---------- */
async function handle(req, res) {
  const url = new URL(req.url, BASE_URL);
  const route = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      ...securityHeaders(),
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  if (route === '/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'sentinel-recovery-intake', time: now() }, req);
  }

  /* --- Public: scam report --- */
  if (route === '/api/reports' && method === 'POST') {
    if (rateLimited('report:' + clientIp(req), 6, 10 * 60 * 1000)) {
      return sendJson(res, 429, { ok: false, error: 'Too many submissions. Please try again later.' }, req);
    }

    let form;
    try {
      const raw = await readBody(req);
      const contentType = req.headers['content-type'] || '';
      if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return sendJson(res, 415, { ok: false, error: 'Expected multipart form data.' }, req);
      }
      const request = new Request('http://localhost/', { method: 'POST', headers: { 'content-type': contentType }, body: raw });
      form = await request.formData();
    } catch (error) {
      const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
      return sendJson(res, status, { ok: false, error: 'Invalid submission.' }, req);
    }

    const fields = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') fields[key] = value;
    }

    const { errors, email, description } = validateReport(fields);
    if (errors.length) return sendJson(res, 400, { ok: false, errors }, req);

    const files = form.getAll('evidence').filter((f) => f && typeof f !== 'string' && f.size > 0);
    if (files.length > MAX_FILES) {
      return sendJson(res, 400, { ok: false, error: `Maximum ${MAX_FILES} files allowed.` }, req);
    }
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return sendJson(res, 413, { ok: false, error: 'Each file must be under 15 MB.' }, req);
      }
      const ext = path.extname(file.name || '').toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return sendJson(res, 400, { ok: false, error: 'Unsupported file type: ' + ext }, req);
      }
    }

    const caseId = makeCaseId();
    const list = (key) => JSON.stringify(form.getAll(key).filter((v) => typeof v === 'string'));

    db.prepare(`
      INSERT INTO cases (
        case_id, client_case_id, created_at, submitted_at, status,
        scam_type, incident_date, amount, currency, payment_methods,
        description, suspect_details, platform, reported_to,
        full_name, email, phone, country, contact_preference, support_needs,
        contact_safety, referral, consents, ip_hash, user_agent
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      caseId,
      cleaned(fields.caseId, 40),
      now(),
      cleaned(fields.submittedAt, 40) || now(),
      'new',
      cleaned(fields.scamType, 120),
      cleaned(fields.incidentDate, 20),
      cleaned(fields.amount, 30),
      cleaned(fields.currency, 10),
      list('paymentMethods'),
      description,
      cleaned(fields.suspectDetails, 4000),
      cleaned(fields.platform, 200),
      list('reportedTo'),
      cleaned(fields.fullName, 120),
      email,
      cleaned(fields.phone, 60),
      cleaned(fields.country, 120),
      cleaned(fields.contactPreference, 120),
      cleaned(fields.supportNeeds, 120),
      cleaned(fields.contactSafety, 120),
      cleaned(fields.referral, 120),
      JSON.stringify(['accurate', 'privacyConsent', 'noGuarantee', 'marketing'].filter((k) => ['on', 'true', 'yes', '1'].includes(String(fields[k] || '').toLowerCase()))),
      clientIp(req),
      cleaned(req.headers['user-agent'], 300)
    );

    const caseDir = path.join(EVIDENCE_DIR, caseId.replace(/[^A-Za-z0-9-]/g, ''));
    if (files.length) fs.mkdirSync(caseDir, { recursive: true });
    for (const file of files) {
      const ext = path.extname(file.name || '').toLowerCase();
      const storedName = crypto.randomUUID() + ext;
      fs.writeFileSync(path.join(caseDir, storedName), Buffer.from(await file.arrayBuffer()));
      db.prepare('INSERT INTO evidence (case_id, original_name, stored_name, mime, size, created_at) VALUES (?,?,?,?,?,?)')
        .run(caseId, path.basename(file.name || 'file').slice(0, 200), storedName, cleaned(file.type, 100), file.size, now());
    }

    await sendEmail(
      NOTIFICATION_EMAIL,
      `New scam report ${caseId}`,
      `A new report was submitted.\n\nCase: ${caseId}\nScam type: ${fields.scamType || '-'}\nAmount: ${fields.amount || '-'} ${fields.currency || ''}\nName: ${fields.fullName || '-'}\nEmail: ${email}\n\nView it in the admin dashboard: ${BASE_URL}/admin`
    );

    await sendEmail(
      email,
      `We received your report — ${caseId}`,
      `Thank you for contacting Sentinel Recovery.\n\nYour case reference is ${caseId}. Keep this reference for your records.\n\nA member of the team will review your report and respond to the email address you provided. We may ask for more information, but we will never ask for passwords, PINs, one-time codes, gift cards, cryptocurrency payments or remote access to your device.\n\nThis acknowledgement is not a guarantee of recovery. A case assessment will be provided before any chargeable work is agreed.\n\n— Sentinel Recovery`
    );

    return sendJson(res, 201, { ok: true, caseId, message: 'Report received.' }, req);
  }

  /* --- Public: contact enquiry --- */
  if (route === '/api/contact' && method === 'POST') {
    if (rateLimited('contact:' + clientIp(req), 8, 10 * 60 * 1000)) {
      return sendJson(res, 429, { ok: false, error: 'Too many messages. Please try again later.' }, req);
    }
    let body;
    try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false }, req); }

    const name = cleaned(body.name, 120);
    const email = cleaned(body.email, 254);
    const topic = cleaned(body.topic, 120) || 'General enquiry';
    const message = cleaned(body.message, 5000);

    if (!name || !EMAIL_RE.test(email) || message.length < 10) {
      return sendJson(res, 400, { ok: false, error: 'Please complete all fields.' }, req);
    }

    db.prepare('INSERT INTO enquiries (created_at, name, email, topic, message, ip_hash) VALUES (?,?,?,?,?,?)')
      .run(now(), name, email, topic, message, clientIp(req));

    await sendEmail(NOTIFICATION_EMAIL, `Website enquiry — ${topic}`, `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`);
    return sendJson(res, 201, { ok: true }, req);
  }

  /* --- Public: case status request (never reveals case details) --- */
  if (route === '/api/case-status' && method === 'POST') {
    if (rateLimited('status:' + clientIp(req), 8, 10 * 60 * 1000)) {
      return sendJson(res, 429, { ok: false, error: 'Too many requests. Please try again later.' }, req);
    }
    let body;
    try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false }, req); }

    const caseId = cleaned(body.caseId, 40).toUpperCase();
    const email = cleaned(body.email, 254);
    if (!/^SR-\d{4}-[A-Z0-9]{6}$/.test(caseId) || !EMAIL_RE.test(email)) {
      return sendJson(res, 400, { ok: false, error: 'Enter a valid case reference and email address.' }, req);
    }

    const matched = db.prepare('SELECT 1 FROM cases WHERE case_id = ? AND lower(email) = lower(?)').get(caseId, email) ? 1 : 0;
    db.prepare('INSERT INTO status_requests (created_at, case_id, email, matched, ip_hash) VALUES (?,?,?,?,?)')
      .run(now(), caseId, email, matched, clientIp(req));

    await sendEmail(
      NOTIFICATION_EMAIL,
      `Case status request ${caseId}`,
      `Case: ${caseId}\nEmail on file: ${email}\nReference matched: ${matched ? 'yes' : 'NO — verify before replying'}`
    );

    return sendJson(res, 202, { ok: true, message: 'Request recorded.' }, req);
  }

  /* --- Admin: session --- */
  if (route === '/api/admin/login' && method === 'POST') {
    if (rateLimited('login:' + clientIp(req), 8, 15 * 60 * 1000)) {
      return sendJson(res, 429, { ok: false, error: 'Too many attempts.' }, req);
    }
    let body;
    try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false }, req); }
    if (!verifyAdminPassword(body.password)) {
      return sendJson(res, 401, { ok: false, error: 'Incorrect password.' }, req);
    }
    const token = createSession();
    return sendJson(res, 200, { ok: true }, req, { 'Set-Cookie': cookieHeader(token) });
  }

  if (route === '/api/admin/logout' && method === 'POST') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/(?:^|;\s*)sr_admin=([^;]+)/);
    if (match) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(match[1]));
    return sendJson(res, 200, { ok: true }, req, { 'Set-Cookie': 'sr_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (route === '/api/admin/session' && method === 'GET') {
    return sendJson(res, 200, { ok: !!sessionFromReq(req) }, req, { 'Cache-Control': 'no-store' });
  }

  /* --- Admin: protected data --- */
  if (route.startsWith('/api/admin/')) {
    if (!sessionFromReq(req)) return sendJson(res, 401, { ok: false, error: 'Not authenticated.' }, req);

    if (route === '/api/admin/cases' && method === 'GET') {
      const status = cleaned(url.searchParams.get('status'), 40);
      const q = cleaned(url.searchParams.get('q'), 120).toLowerCase();
      let rows = db.prepare('SELECT case_id, created_at, status, scam_type, full_name, email, amount, currency FROM cases ORDER BY created_at DESC LIMIT 500').all();
      if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => [r.case_id, r.full_name, r.email, r.scam_type].join(' ').toLowerCase().includes(q));
      return sendJson(res, 200, { ok: true, cases: rows }, req);
    }

    const caseMatch = route.match(/^\/api\/admin\/cases\/([A-Za-z0-9-]+)$/);
    if (caseMatch && method === 'GET') {
      const row = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseMatch[1]);
      if (!row) return sendJson(res, 404, { ok: false }, req);
      const evidence = db.prepare('SELECT id, original_name, size, created_at FROM evidence WHERE case_id = ? ORDER BY id').all(caseMatch[1]);
      return sendJson(res, 200, { ok: true, case: row, evidence }, req);
    }

    if (caseMatch && method === 'PATCH') {
      let body;
      try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false }, req); }
      const allowed = ['new', 'in-review', 'assessment', 'active', 'on-hold', 'resolved', 'declined', 'closed'];
      const status = cleaned(body.status, 40);
      const notes = cleaned(body.notes, 20000);
      if (status && !allowed.includes(status)) return sendJson(res, 400, { ok: false, error: 'Invalid status.' }, req);
      if (status) db.prepare('UPDATE cases SET status = ? WHERE case_id = ?').run(status, caseMatch[1]);
      if (notes !== undefined) db.prepare('UPDATE cases SET notes = ? WHERE case_id = ?').run(notes, caseMatch[1]);
      return sendJson(res, 200, { ok: true }, req);
    }

    const fileMatch = route.match(/^\/api\/admin\/evidence\/(\d+)\/download$/);
    if (fileMatch && method === 'GET') {
      const row = db.prepare('SELECT * FROM evidence WHERE id = ?').get(fileMatch[1]);
      if (!row) return sendJson(res, 404, { ok: false }, req);
      const caseRow = db.prepare('SELECT case_id FROM cases WHERE case_id = ?').get(row.case_id);
      if (!caseRow) return sendJson(res, 404, { ok: false }, req);
      const dir = path.join(EVIDENCE_DIR, row.case_id.replace(/[^A-Za-z0-9-]/g, ''));
      const full = path.join(dir, path.basename(row.stored_name));
      if (!fs.existsSync(full)) return sendJson(res, 404, { ok: false }, req);
      const safeName = path.basename(row.original_name).replace(/["\r\n]/g, '_');
      return send(res, 200, fs.readFileSync(full), {
        'Content-Type': row.mime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
      }, req);
    }

    if (route === '/api/admin/enquiries' && method === 'GET') {
      return sendJson(res, 200, { ok: true, enquiries: db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 300').all() }, req);
    }

    if (route === '/api/admin/status-requests' && method === 'GET') {
      return sendJson(res, 200, { ok: true, requests: db.prepare('SELECT * FROM status_requests ORDER BY created_at DESC LIMIT 300').all() }, req);
    }

    return sendJson(res, 404, { ok: false }, req);
  }

  if (STATIC_FILES[route] && method === 'GET') {
    const asset = STATIC_FILES[route];
    return serveStatic(res, asset.file, asset.type);
  }

  return sendJson(res, 404, { ok: false, error: 'Not found.' }, req);
}

/* ---------- Start ---------- */
const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('Request failed:', error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Server error.' }, req);
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Sentinel Recovery intake API listening on ${BASE_URL}`);
  console.log(`Admin dashboard: ${BASE_URL}/admin`);
  console.log(`Evidence storage: ${EVIDENCE_DIR}`);
  if (!RESEND_API_KEY) console.log('Email notifications disabled (set RESEND_API_KEY to enable).');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
