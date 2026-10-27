const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('./db');
const { PORT, SYNC_MINUTES } = require('./config');
const { requireAuth, requireAdmin } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/leads', requireAuth, require('./routes/leads'));
app.use('/api/calls', requireAuth, require('./routes/calls'));
app.use('/api/activity', requireAuth, require('./routes/activity'));
app.use('/api/phone', requireAuth, require('./routes/phone'));
app.use('/api/stats', requireAuth, require('./routes/stats'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsapp'));
app.use('/api/inbox', requireAuth, require('./routes/inbox'));
app.use('/api/attendance', requireAuth, require('./routes/attendance'));
const imports = require('./routes/imports');
app.use('/api/import', requireAuth, requireAdmin, imports);

// Serve the built React app in production
const distCandidates = [
  path.join(__dirname, '..', '..', 'client', 'dist'),
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', '..', 'dist'),
  path.join(__dirname, '..', 'public'),
];
const dist = distCandidates.find((d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));
if (dist) {
  console.log(`[Production] Serving static client build from: ${dist}`);
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
// MySQL stopped / unreachable (XAMPP closed or crashed): answer with a clear message instead of a stack trace
const DB_DOWN = ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNRESET'];
let lastDbWarn = 0;
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (DB_DOWN.includes(err.code)) {
    if (Date.now() - lastDbWarn > 30000) { // print once, not on every request
      lastDbWarn = Date.now();
      console.error('\n[!] MySQL is not reachable — open XAMPP Control Panel and make sure MySQL is "Running" (green). The CRM reconnects by itself.\n');
    }
    return res.status(503).json({ message: 'Database (MySQL) is not running. Start MySQL in XAMPP, then try again.' });
  }
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This record already exists' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Server error: ' + err.message });
});

const lanUrls = () => Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}`);

// Wait for MySQL instead of quitting: start XAMPP MySQL any time and the CRM continues by itself.
async function initWithRetry() {
  let warned = false;
  for (;;) {
    try { await db.init(); return; }
    catch (e) {
      if (!/Cannot connect to MySQL/.test(e.message)) throw e;        // wrong password etc. -> real error, stop
      if (!warned) { console.error('\n' + e.message + '\nWaiting for MySQL… (the CRM will start automatically as soon as MySQL is running)\n'); warned = true; }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

initWithRetry().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nCalling CRM is running`);
    console.log(`  This computer : http://localhost:${PORT}`);
    lanUrls().forEach((u) => console.log(`  On your mobile: ${u}   (phone must be on the same Wi-Fi)`));
  });

  // Share out fresh clients: right now, then every minute (new imports, a new day, the 12:00 cutoff, someone marked absent …)
  const { distributeFresh } = require('./inbox');
  const share = () => distributeFresh().catch((e) => { if (!DB_DOWN.includes(e.code)) console.warn('Distribution error:', e.message); });
  share();
  setInterval(share, 60_000).unref();

  // Auto-import new rows from saved Google Sheets (silently skipped while MySQL is down)
  if (SYNC_MINUTES > 0) {
    setInterval(async () => {
      try {
        const sources = require('./sheetSources').list().filter((x) => x.auto_sync);
        for (const s of sources) {
          try { await imports.syncSource(s); } catch (e) { console.warn('Auto-sync failed for', s.label, e.message); }
        }
      } catch (e) { if (!DB_DOWN.includes(e.code)) console.warn('Auto-sync error:', e.message); }
    }, SYNC_MINUTES * 60_000).unref();
  }
}).catch((e) => { console.error('\n' + e.message + '\n'); process.exit(1); });

// A stray error must never kill the server during a call
process.on('unhandledRejection', (e) => console.error('Unhandled:', e?.message || e));
