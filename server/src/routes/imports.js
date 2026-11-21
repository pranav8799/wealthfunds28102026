const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const db = require('../db');
const sources = require('../sheetSources');
const { wrap, nowIso } = require('../util');
const { logActivity } = require('../activity');
const { parseFile, fetchSheet, guessMapping, detectOld, oldPreview, importRows, httpError } = require('../importer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Parsed files wait here (10 min) between "preview" and "import"
const pending = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}, 60_000).unref();

router.post('/preview', upload.single('file'), wrap(async (req, res) => {
  let parsed, url = null;
  if (req.file) parsed = parseFile(req.file.buffer, req.file.originalname);
  else if (req.body.url) { url = String(req.body.url).trim(); parsed = await fetchSheet(url); }
  else throw httpError(400, 'Upload a file or paste a Google Sheet link');

  const importId = crypto.randomUUID();
  pending.set(importId, { ...parsed, url, label: req.file?.originalname || 'Google Sheet', expires: Date.now() + 10 * 60_000 });
  const mapping = guessMapping(parsed.columns, parsed.rows);
  // OLD data (has an executive column and / or NP - NI - link results)? then show who owns what and the sorted status
  let old = null;
  const det = await detectOld(parsed.rows, parsed.columns, mapping.phoneCol);
  if (det.isOld && mapping.phoneCol) old = await oldPreview(parsed.rows, parsed.columns, mapping.nameCol, mapping.phoneCol, det);
  res.json({
    importId,
    columns: parsed.columns,
    sample: parsed.rows.slice(0, 5),
    total: parsed.rows.length,
    mapping,
    fromUrl: !!url,
    old,
  });
}));

// Admin changed the Name / Mobile column in the preview -> recompute the old-data summary
router.post('/old-preview', wrap(async (req, res) => {
  const p = pending.get(req.body.importId);
  if (!p) throw httpError(400, 'Preview expired — please select the file again');
  const { nameCol, phoneCol } = req.body;
  if (!nameCol || !phoneCol || !p.columns.includes(nameCol) || !p.columns.includes(phoneCol)) return res.json({ old: null });
  const det = await detectOld(p.rows, p.columns, phoneCol);
  res.json({ old: det.isOld ? await oldPreview(p.rows, p.columns, nameCol, phoneCol, det) : null });
}));

router.post('/commit', wrap(async (req, res) => {
  const { importId, nameCol, phoneCol, autoSync, importAs, execMap } = req.body;
  const p = pending.get(importId);
  if (!p) throw httpError(400, 'Preview expired — please select the file again');
  if (!nameCol || !phoneCol || !p.columns.includes(nameCol) || !p.columns.includes(phoneCol))
    throw httpError(400, 'Choose the Name and Mobile columns');
  const source = p.url ? 'google-sheet' : 'file';
  // importAs: 'old' (keep executive + NP/NI/link status)  |  'new' (everything fresh). Default = what the file looks like.
  let opts = {};
  const det = await detectOld(p.rows, p.columns, phoneCol);
  if (det.isOld && importAs !== 'new') opts = { old: { ...det, execMap: execMap || {} } };
  const result = await importRows(p.rows, nameCol, phoneCol, source, p.label, opts);
  if (p.url) {
    sources.upsert({ label: p.label.slice(0, 250), url: p.url, name_col: nameCol, phone_col: phoneCol,
      auto_sync: autoSync ? 1 : 0, last_synced_at: nowIso(), last_result: result });
  }
  const oldTxt = result.old ? ` [OLD data → ${Object.entries(result.byExec).map(([k, v]) => `${k}: ${v}`).join(', ') || 'no executive'}; Not pickup ${result.byStatus.NO_ANSWER}, Not interested ${result.byStatus.NOT_INTERESTED}, Interested ${result.byStatus.INTERESTED}]` : '';
  await logActivity(req, 'IMPORT', `Imported "${p.label}" — ${result.added} new, ${result.duplicates} duplicate, ${result.invalid} invalid (of ${result.total})${oldTxt}`,
    { details: { ...result, label: p.label, source } });
  pending.delete(importId);
  res.json(result);
}));

// Import history = the IMPORT entries of the activity log (no separate table)
router.get('/history', wrap(async (req, res) => {
  const rows = await db.all("SELECT id, user_name, user_role, summary, details, created_at FROM activity_log WHERE action='IMPORT' ORDER BY id DESC LIMIT 50");
  res.json(rows.map((r) => {
    let d = {}; try { d = JSON.parse(r.details || '{}'); } catch { /* old row */ }
    return {
      id: r.id, created_at: r.created_at,
      label: d.label || (r.summary.match(/"([^"]+)"/) || [])[1] || r.summary,
      user_name: r.user_role === 'system' ? null : r.user_name,
      added: d.added ?? 0, duplicates: d.duplicates ?? 0, invalid: d.invalid ?? 0, total: d.total ?? 0,
    };
  }));
}));

router.get('/sources', wrap(async (req, res) => res.json(sources.list())));

async function syncSource(src, manual = false, req = null) {
  const { rows, columns } = await fetchSheet(src.url);
  if (!columns.includes(src.name_col) || !columns.includes(src.phone_col))
    throw httpError(400, 'Column names changed in the sheet. Re-import it once to remap columns.');
  const result = await importRows(rows, src.name_col, src.phone_col, 'google-sheet', src.label);
  sources.update(src.id, { last_synced_at: nowIso(), last_result: result });
  // automatic (scheduled) syncs are written to the activity log only when new leads actually arrived
  if (!manual && result.added > 0) {
    await logActivity({ headers: {}, socket: {} }, 'IMPORT', `Auto-sync "${src.label}" — ${result.added} new, ${result.duplicates} existing`,
      { user: { id: null, name: 'System', role: 'system' }, details: { ...result, label: `${src.label} (auto-sync)`, source: 'google-sheet' } });
  }
  return result;
}

router.post('/sources/:id/sync', wrap(async (req, res) => {
  const src = sources.get(req.params.id);
  if (!src) throw httpError(404, 'Source not found');
  const r = await syncSource(src, true);
  await logActivity(req, 'IMPORT', `Synced "${src.label}" — ${r.added} new, ${r.duplicates} existing`, { details: { ...r, label: `${src.label} (sync)`, source: 'google-sheet' } });
  res.json(r);
}));

router.patch('/sources/:id', wrap(async (req, res) => {
  sources.update(req.params.id, { auto_sync: req.body.auto_sync ? 1 : 0 });
  res.json({ ok: true });
}));

router.delete('/sources/:id', wrap(async (req, res) => {
  sources.remove(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.syncSource = syncSource;
