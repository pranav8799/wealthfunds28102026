# Calling CRM — Feature Update Notes
**Date:** 2026-10-29  
**Scope:** Callback Management · Demo/Trial · Status Pages · Call-Ended Popup · Sales Workflow · Permissions · Search & Dashboard · OTP polish

All changes are **additive and backward-compatible**. Existing data, routes, authentication, UI design language, and features are preserved.

---

## 1. Database Migration (run once)

```bash
# From project root, against your existing calling_crm database:
mysql -u YOUR_USER -p calling_crm < database/migrations/001_callback_trial_status.sql
```

Or paste the SQL into phpMyAdmin.

**What it adds (no data deleted):**
- `leads.status` widened to VARCHAR(30)
- `leads.trial_days`, `trial_started_at`, `trial_ends_at`, `sold_at`, `sold_by`
- Indexes `idx_leads_followup`, `idx_leads_trial`
- `login_otps.user_name`, `login_otps.status` (PENDING | VERIFIED | EXPIRED | FAILED)
- Backfills existing OTP rows; clears plaintext OTP after use/expiry

`server/src/schema.js` is also updated so **fresh installs** get the same columns automatically.

---

## 2. Files Modified

### Server
| File | Change |
|------|--------|
| `server/src/schema.js` | New lead columns + OTP columns for fresh installs |
| `server/src/routes/calls.js` | Outcomes: TRIAL, FOLLOWUP, DONE_SOLD; trial duration; account opens only on Done/Sold |
| `server/src/routes/leads.js` | Status filters, callback/trial sort, Done/Sold view-for-all / edit-for-admin-only, search by executive name/ID |
| `server/src/routes/stats.js` | Trial ending/expired counts & lists, expanded status KPIs |
| `server/src/routes/auth.js` | OTP stores user_name + status; plaintext cleared after verify/expire |

### Client
| File | Change |
|------|--------|
| `client/src/utils.js` | STATUSES, STATUS_META, TRIAL_PRESETS, expanded OUTCOMES with icons |
| `client/src/components/ui.jsx` | Badge supports compact icon + tooltip for all new statuses |
| `client/src/context/Dialer.jsx` | Call-ended popup: Trial duration picker, Follow-up date, Done/Sold confirmation |
| `client/src/pages/Clients.jsx` | Status chips, callback/trial filters & sort, search by executive/ID, Done/Sold lock |
| `client/src/pages/Dashboard.jsx` | Trial / Done-Sold KPIs + “Trial Ending Soon” / “Trial Expired” panels |

### New
| File | Purpose |
|------|---------|
| `database/migrations/001_callback_trial_status.sql` | One-time safe migration |

---

## 3. Feature Summary

### Callback Management
- Schedule by date & time from call-end popup or client edit
- Sorted: **overdue → today → future**
- Filters: Overdue / Today / Due now
- Dashboard shows follow-ups due

### Demo & Trial
- After demo select **Trial** → choose 2 / 3 / 5 / 8 days or custom (1–90)
- Auto sets `trial_started_at` / `trial_ends_at` and places client in Follow-up
- Dashboard & Clients: **Trial Ending Soon** (≤2 days) and **Trial Expired** alerts
- Account is **NOT** activated when trial expires — only on Done/Sold

### Client Status Sections
Chips with compact icons + tooltips:  
Interested · Not Interested · Callback · Trial · Follow-up · Active · Not Active · Done/Sold  
+ Ending Soon / Expired shortcuts

### Call-Ended Popup
Select directly: Interested / Not Interested / Callback / Trial / Follow-up / Done/Sold  
Enter trial days, callback/follow-up datetime, and remarks without opening the client page.

### Sales Workflow
Demo → Trial → (client agrees) → **Done/Sold**  
Only Done/Sold sets `account_status = OPENED` and records `sold_at` / `sold_by`.

### Executive Permissions
- Every executive can **view** all Done/Sold clients (read-only)
- Cannot edit or delete Done/Sold (backend enforced)
- Own assigned clients: full existing permissions
- Admins: full access everywhere

### Search & Dashboard
- Search: name, mobile, executive name, lead ID, executive ID
- Dashboard: trial KPIs, callback reminders, trial expiry lists, Done/Sold count

### OTP table
- Shows admin/executive **name**, **ID**, and status (Pending / Verified / Expired / Failed)
- Plaintext OTP cleared after verification or expiry
- Passwords remain bcrypt only — never stored or displayed in plaintext

---

## 4. Setup after pulling changes

1. Run the migration SQL (section 1).
2. Restart the Node server (`npm start` or your process manager).
3. Rebuild the client if you deploy the built assets:
   ```bash
   cd client && npm install && npm run build
   # copy dist into server/dist if that is your production layout
   ```
4. No seed data or existing records need to be touched.

---

## 5. Compatibility notes

- Existing statuses (`NEW`, `INTERESTED`, `CALLBACK`, …) continue to work.
- Existing call outcomes are accepted; new ones are additive.
- Triggers that keep `executive_name` in sync are unchanged.
- Android app and phone-mode hangup detection are untouched.
- All previous API paths remain valid.

If anything looks unexpected after migration, check the browser console and server logs for the first request that touches the new columns — the migration must be applied before the new server code runs.


---
# v3 update (2026-11-03) - nothing existing was removed

## What is new
1. Demo / Trial - Active / Not active. In the call-ended pop-up pick 2 / 3 / 5 / 8 days, any number of days, or an exact end date and time. The pop-up shows "Active until ...". While the trial runs the client is Active (the Clients list shows: Demo, time left, end date). When it runs out the server moves the client to Follow-up and marks it Not active (job in server/src/index.js, every minute). A 2nd, 3rd demo is counted (leads.trial_count, shown as "Demo #2").
2. Callbacks by date. Default order in All Clients is "Due callbacks first": overdue and today's callbacks / follow-ups on top, earliest first; the rest newest first. New filter "Coming days". Also fixed: the "today" filter used the UTC date, now it uses India time.
3. Alerts bar on every page: callbacks due, demos ending within 24 h, demos just ended (links + pop-up message).
4. Done / Sold clients: every executive can see and search them, only admin can edit (as before). The sale shows who closed it (leads.sold_by_name).
5. Executives can delete / multi-select their OWN clients (account not opened). Import and assign stay admin-only.
6. Database
   - login_otps: user_name, user_role (executive / admin), user_phone, status (PENDING / VERIFIED / EXPIRED / FAILED), verified_at. Unused OTPs turn EXPIRED automatically.
   - users.password_enc: the password, AES-256 encrypted. Admin: Executives -> Password (each view is logged). Login still uses the bcrypt hash. Old users show "not stored" until their password is set once.
   - Name next to every id: leads.executive_name, leads.sold_by_name, calls.executive_name, attendance.user_name, trusted_devices.user_name, lead_shares.from_user_name / to_user_name, login_otps.user_name (triggers keep them right, also when a name changes).
   - All of it is added automatically when the server starts. Nothing to import. Old data stays.

## Files changed
server: schema.js db.js triggers.js util.js index.js routes/leads.js routes/calls.js routes/users.js routes/auth.js routes/stats.js
client: utils.js pages/Clients.jsx pages/Executives.jsx context/Dialer.jsx components/Layout.jsx - and a rebuilt server/dist

---
## Import: OLD data sorting (2026-11-06)
Files changed: `server/src/importer.js`, `server/src/routes/imports.js`, `client/src/components/ImportModal.jsx` (+ rebuilt `server/dist`).
* Old file (xlsx / csv) is detected by content: a column with executive names + columns with NP / NI / link.
* Each client goes to the executive named in the file. Result: link → Interested, NI → Not interested, NP → Not pickup (link beats NI beats NP).
* Preview shows executive-wise table (counts per status), per-row executive + status; unknown executive names can be mapped by dropdown.
* New file (Facebook CSV etc.) works as before: all NEW and shared between present executives.
* Mobile / name columns are now guessed from the data too (works with shifted or repeated headers).
