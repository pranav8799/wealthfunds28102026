const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const db = require('./db');
const { normalizePhone } = require('./util');

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^﻿/, '');
  return buf.toString('utf8').replace(/^﻿/, '');
}

function parseCsv(text) {
  const records = parse(text, {
    columns: (h) => {
      const seen = {};
      return h.map((x, i) => {
        const base = String(x || `Column ${i + 1}`).trim();
        seen[base] = (seen[base] || 0) + 1;
        return seen[base] === 1 ? base : `${base}_${seen[base] - 1}`;   // repeated header -> ad_name, ad_name_1 ...
      });
    },
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
    delimiter: [',', '\t', ';'],
  });
  return records;
}

function parseXlsx(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  return raw.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      o[String(k).trim()] = v instanceof Date ? v.toISOString() : String(v ?? '').trim();
    }
    return o;
  });
}

function parseFile(buf, filename = '') {
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(filename);
  const rows = isExcel ? parseXlsx(buf) : parseCsv(decode(buf));
  return finish(rows);
}

function finish(rows) {
  if (!rows.length) throw httpError(400, 'The file has no data rows');
  const columns = Object.keys(rows[0]);
  return { columns, rows };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Turn any Google Sheets link into a CSV export link
function toCsvUrl(url) {
  const m = url.match(/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
  if (!m) return url; // assume already a direct CSV link
  if (/\/pub/.test(url) && /output=csv/.test(url)) return url;
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

async function fetchSheet(url) {
  let res;
  try {
    res = await fetch(toCsvUrl(url), { redirect: 'follow' });
  } catch (e) {
    throw httpError(502, 'Could not reach Google Sheets: ' + e.message);
  }
  if (!res.ok) throw httpError(400, `Google Sheet returned ${res.status}. Make sure link sharing is ON (Anyone with the link → Viewer).`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw httpError(400, 'Sheet is private. In Google Sheets click Share → General access → "Anyone with the link" (Viewer), then try again.');
  }
  return finish(parseCsv(text.replace(/^﻿/, '')));
}

// ---------- column guessing (looks at the DATA too, because old sheets have shifted / repeated headers) ----------
const nonEmpty = (v) => String(v ?? '').trim() !== '';
const validPhoneShare = (rows, col) => {
  const vals = rows.map((r) => r[col]).filter(nonEmpty);
  return vals.length ? vals.filter((v) => normalizePhone(v)).length / vals.length : 0;
};

function guessMapping(columns, rows = []) {
  const lc = columns.map((c) => c.toLowerCase());
  const find = (...res) => {
    for (const re of res) {
      const i = lc.findIndex((c) => re.test(c));
      if (i >= 0) return columns[i];
    }
    return '';
  };
  const sample = rows.slice(0, 300);
  // mobile: header first (if the data really looks like phone numbers), otherwise the column with the most valid numbers
  let phoneCol = find(/^phone[_ ]?number$/, /mobile/, /phone/, /whatsapp/, /contact/, /number/);
  if (phoneCol && sample.length && validPhoneShare(sample, phoneCol) < 0.5) phoneCol = '';
  if (!phoneCol && sample.length) {
    let best = 0;
    for (const c of columns) { const sh = validPhoneShare(sample, c) * sample.filter((r) => nonEmpty(r[c])).length; if (sh > best) { best = sh; phoneCol = c; } }
  }
  // name: header first (ad_name / adset_name are NOT client names), else the column left of the phone column, else any "name"
  let nameCol = find(/^full[_ ]?name$/, /^name$/, /client.*name/, /^(first|customer|lead)[_ ]?name$/);
  if (!nameCol && phoneCol) {
    const i = columns.indexOf(phoneCol);
    const left = columns[i - 1];
    if (left && sample.some((r) => /[a-z\u0900-\u097f]/i.test(String(r[left] || ''))) && validPhoneShare(sample, left) < 0.3) nameCol = left;
  }
  if (!nameCol) nameCol = columns.find((c) => /name/i.test(c) && !/^ad(set)?[_ ]?name/i.test(c)) || find(/name/);
  return { nameCol, phoneCol };
}

// ---------- OLD DATA (client sheets that already carry an executive + call results NP / NI / link) ----------
// NP = Not pickup -> NO_ANSWER,  NI = Not interested -> NOT_INTERESTED,  link = interested (link sent) -> INTERESTED
const OUTCOME_WORDS = {
  np: 'NP', 'not pickup': 'NP', 'not picked': 'NP', 'not pickedup': 'NP', 'not picked up': 'NP', 'no pickup': 'NP', 'no answer': 'NP', 'not reachable': 'NP', nr: 'NP', 'switch off': 'NP', 'switched off': 'NP',
  ni: 'NI', 'not interested': 'NI', 'not intrested': 'NI', 'no interest': 'NI',
  link: 'LINK', links: 'LINK', 'link sent': 'LINK', interested: 'LINK', intrested: 'LINK',
};
const STATUS_OF = { NP: 'NO_ANSWER', NI: 'NOT_INTERESTED', LINK: 'INTERESTED' };
const outcomeOf = (v) => OUTCOME_WORDS[String(v ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()] || null;

// Final status of one client from every NP / NI / link written in its row:  link (interested) beats NI beats NP.
function pickFinal(codes) {
  if (codes.includes('LINK')) return 'LINK';
  if (codes.includes('NI')) return 'NI';
  if (codes.includes('NP')) return 'NP';
  return null;
}

// Looks at the file and says whether it is "old data": has an executive column and/or NP/NI/link result columns.
async function detectOld(rows, columns, phoneCol) {
  const users = await db.all("SELECT id, name FROM users WHERE role='executive'");
  const byName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u]));
  const sample = rows.slice(0, 2000);
  // result columns = columns whose filled cells are (mostly) NP / NI / link
  const outcomeCols = columns.filter((c) => {
    const vals = sample.map((r) => r[c]).filter(nonEmpty);
    return vals.length && vals.filter((v) => outcomeOf(v)).length / vals.length >= 0.6;
  });
  // executive column = the column whose values are mostly executive names
  let execCol = '', best = 0;
  for (const c of columns) {
    if (outcomeCols.includes(c) || c === phoneCol) continue;
    const vals = sample.map((r) => r[c]).filter(nonEmpty);
    const hit = vals.filter((v) => byName.has(String(v).trim().toLowerCase())).length;
    if (hit > best && hit / vals.length >= 0.3) { best = hit; execCol = c; }
  }
  const isOld = !!outcomeCols.length || !!execCol;
  return { isOld, execCol, outcomeCols, users };
}

// Classifies every row: who owns it + what the last result is. Used for the preview AND for the import.
function classifyOld(rows, { execCol, outcomeCols }, users, nameCol, phoneCol, execMap = {}) {
  const byName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u]));
  return rows.map((r) => {
    const codes = outcomeCols.map((c) => outcomeOf(r[c])).filter(Boolean);
    const final = pickFinal(codes);
    const execText = String(execCol ? r[execCol] ?? '' : '').trim();
    let user = execText ? byName.get(execText.toLowerCase()) : null;
    if (execText && !user && execMap[execText]) user = users.find((u) => u.id === Number(execMap[execText])) || null;
    return {
      name: String(r[nameCol] || '').trim(), mobile: normalizePhone(r[phoneCol]), rawMobile: r[phoneCol],
      execText, executive_id: user?.id || null, executive_name: user?.name || null,
      codes, final, status: final ? STATUS_OF[final] : 'NEW',
    };
  });
}

// Everything the admin needs to see before importing old data
async function oldPreview(rows, columns, nameCol, phoneCol, old) {
  const cls = classifyOld(rows, old, old.users, nameCol, phoneCol);
  const execs = {};   // executive text in file -> { count, matched, byStatus }
  const status = { NO_ANSWER: 0, NOT_INTERESTED: 0, INTERESTED: 0, NEW: 0 };
  for (const c of cls) {
    if (!c.mobile) continue;
    const k = c.execText || '(no executive)';
    const e = (execs[k] ||= { name: k, matchedId: c.executive_id, matchedName: c.executive_name, count: 0, NO_ANSWER: 0, NOT_INTERESTED: 0, INTERESTED: 0, NEW: 0 });
    e.count++; e[c.status]++; status[c.status]++;
  }
  return {
    execCol: old.execCol, outcomeCols: old.outcomeCols,
    executives: Object.values(execs).sort((a, b) => b.count - a.count),
    status,
    users: old.users,
    rows: cls.slice(0, 300).map((c) => ({ name: c.name || 'Unknown', mobile: c.mobile, rawMobile: c.rawMobile, execText: c.execText, executive_name: c.executive_name, status: c.status, codes: c.codes })),
  };
}

// Fast bulk import: rows are inserted 300 at a time; numbers that already exist (or repeat inside the file) are skipped.
//  opts.old = { execCol, outcomeCols, users, execMap }  -> OLD data: every client goes to the executive written in the file
//  and gets its status (NP -> Not pickup, NI -> Not interested, link -> Interested). Without opts.old everything is NEW (fresh).
async function importRows(rows, nameCol, phoneCol, source, label = null, opts = {}) {
  let duplicates = 0, invalid = 0;
  const seen = new Set(), fresh = [];
  const old = opts.old || null;
  const cls = old ? classifyOld(rows, old, old.users, nameCol, phoneCol, old.execMap || {}) : null;
  const byExec = {}, byStatus = { NO_ANSWER: 0, NOT_INTERESTED: 0, INTERESTED: 0, NEW: 0 };
  const now = new Date().toISOString();
  const skipCols = new Set([nameCol, phoneCol]);
  rows.forEach((r, idx) => {
    const mobile = normalizePhone(r[phoneCol]);
    if (!mobile) { invalid++; return; }
    if (seen.has(mobile)) { duplicates++; return; }
    seen.add(mobile);
    const name = (String(r[nameCol] || '').trim() || 'Unknown').slice(0, 160);
    const extra = {};
    for (const [k, v] of Object.entries(r)) {
      if (!skipCols.has(k) && v !== '' && v != null) extra[k] = v;
    }
    if (!old) { fresh.push({ vals: [name, mobile, source, JSON.stringify(extra), label ? String(label).slice(0, 250) : null], old: false }); return; }
    const c = cls[idx];
    const hasHistory = !!c.final;
    const calls = c.codes.length;
    const remark = hasHistory ? `Old data: ${c.codes.map((x) => (x === 'LINK' ? 'link' : x)).join(', ')}${c.execText ? ` (${c.execText})` : ''}` : null;
    byStatus[c.status]++;
    if (c.executive_name) byExec[c.executive_name] = (byExec[c.executive_name] || 0) + 1;
    fresh.push({
      old: true, execId: c.executive_id,
      vals: [name, mobile, source, JSON.stringify(extra), label ? String(label).slice(0, 250) : null,
        c.status, c.executive_id, remark, hasHistory ? calls : 0,
        hasHistory ? now : null, c.status === 'INTERESTED' ? now : null],
    });
  });

  let added = 0;
  await db.tx(async (t) => {
    for (let i = 0; i < fresh.length; i += 300) {
      const chunk = fresh.slice(i, i + 300);
      let res;
      if (!old) {
        res = await t.run('INSERT IGNORE INTO leads (name, mobile, source, extra, import_label) VALUES ?', [chunk.map((x) => x.vals)]);
      } else {
        // old data: owner + status + call count are set here, so these clients are NOT re-distributed as "fresh"
        res = await t.run('INSERT IGNORE INTO leads (name, mobile, source, extra, import_label, status, executive_id, remark, call_count, last_called_at, interested_at) VALUES ?', [chunk.map((x) => x.vals)]);
      }
      added += res.affectedRows;
      duplicates += chunk.length - res.affectedRows;
    }
  });
  // new (fresh) clients are shared out between the executives straight away. Old data keeps the executive written in the file.
  if (added > 0) require('./inbox').distributeFresh().catch((e) => console.warn('distribution after import failed:', e.message));
  return { added, duplicates, invalid, total: rows.length, old: !!old, byExec, byStatus,
    unassigned: old ? fresh.filter((x) => !x.execId).length : 0 };
}

module.exports = { parseFile, fetchSheet, guessMapping, detectOld, oldPreview, importRows, httpError };
