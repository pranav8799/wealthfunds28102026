// Every table of the CRM. Created automatically on first start (and also available as database/calling_crm.sql).
const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

module.exports = [
`CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  password_enc VARCHAR(400) NULL,                    -- the password, AES-256 encrypted (admin can reveal it in Executives; never plain text)
  role ENUM('admin','executive') NOT NULL DEFAULT 'executive',
  active TINYINT(1) NOT NULL DEFAULT 1,
  zoom_link VARCHAR(500) NULL,                       -- this executive's own Zoom link (used in his WhatsApp messages)
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_name (name)
) ${T}`,

`CREATE TABLE IF NOT EXISTS leads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  executive_id INT UNSIGNED NULL,
  executive_name VARCHAR(120) NULL,                  -- copy of users.name, kept in sync by triggers (readable in phpMyAdmin)
  remark TEXT NULL,
  call_count INT NOT NULL DEFAULT 0,
  group_joined TINYINT(1) NOT NULL DEFAULT 0,
  webinar_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  account_status VARCHAR(20) NOT NULL DEFAULT 'NOT_OPENED',
  followup_at DATETIME(3) NULL,
  last_called_at DATETIME(3) NULL,
  interested_at DATETIME(3) NULL,                    -- when the client was marked Interested (starts the 10-day account-opening window)
  trial_days INT UNSIGNED NULL,                     -- custom trial duration in days (2/3/5/8 or any)
  trial_started_at DATETIME(3) NULL,
  trial_ends_at DATETIME(3) NULL,
  sold_at DATETIME(3) NULL,                         -- when marked Done/Sold (purchase confirmed)
  sold_by INT UNSIGNED NULL,
  sold_by_name VARCHAR(120) NULL,                    -- name of the executive who closed the sale (kept in sync by triggers)
  trial_count INT UNSIGNED NOT NULL DEFAULT 0,       -- how many demos / trials this client has had (1st, 2nd …)
  source VARCHAR(30) NOT NULL DEFAULT 'manual',      -- manual | file | google-sheet
  import_label VARCHAR(255) NULL,                    -- file name / sheet it was imported from
  extra LONGTEXT NULL,
  inbox_date DATE NULL,
  inbox_pinned TINYINT(1) NOT NULL DEFAULT 0,
  shared_from INT UNSIGNED NULL,
  shared_at DATETIME(3) NULL,
  shared_note VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_leads_mobile (mobile),
  KEY idx_leads_exec (executive_id),
  KEY idx_leads_status (status),
  KEY idx_leads_created (created_at),
  KEY idx_leads_inbox (call_count, executive_id, inbox_date),
  KEY idx_leads_followup (status, followup_at),
  KEY idx_leads_trial (trial_ends_at),
  CONSTRAINT fk_leads_exec FOREIGN KEY (executive_id) REFERENCES users (id) ON DELETE SET NULL
) ${T}`,

`CREATE TABLE IF NOT EXISTS calls (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT UNSIGNED NOT NULL,
  executive_id INT UNSIGNED NOT NULL,
  executive_name VARCHAR(120) NULL,                  -- copy of users.name, kept in sync by triggers
  started_at DATETIME(3) NOT NULL,
  hangup_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  duration_sec INT NOT NULL DEFAULT 0,
  outcome VARCHAR(20) NULL,
  remark TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_calls_lead (lead_id),
  KEY idx_calls_exec (executive_id),
  KEY idx_calls_started (started_at),
  CONSTRAINT fk_calls_lead FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
  CONSTRAINT fk_calls_exec FOREIGN KEY (executive_id) REFERENCES users (id)
) ${T}`,

// Every action an executive / admin performs is written here (audit trail)
`CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(120) NULL,
  user_role VARCHAR(20) NULL,
  action VARCHAR(40) NOT NULL,
  lead_id INT UNSIGNED NULL,
  lead_name VARCHAR(160) NULL,
  summary VARCHAR(600) NOT NULL,
  details LONGTEXT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_act_user (user_id, created_at),
  KEY idx_act_lead (lead_id, created_at),
  KEY idx_act_action (action),
  KEY idx_act_created (created_at),
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ${T}`,

// Daily attendance. A row is created automatically the first time an executive uses the CRM that day.
// status: PRESENT | HALF_DAY | ABSENT | LEAVE.  manual=1 means the admin set it (never overwritten automatically).
`CREATE TABLE IF NOT EXISTS attendance (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  user_name VARCHAR(120) NULL,                       -- executive name next to the id (triggers keep it in sync)
  work_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PRESENT',
  first_login_at DATETIME(3) NULL,
  last_seen_at DATETIME(3) NULL,
  manual TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att (user_id, work_date),
  KEY idx_att_date (work_date),
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ${T}`,

// Browsers / PCs / phones that already passed the OTP check for a user
`CREATE TABLE IF NOT EXISTS trusted_devices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  user_name VARCHAR(120) NULL,                       -- executive name next to the id (triggers keep it in sync)
  device_hash CHAR(64) NOT NULL,
  label VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dev (user_id, device_hash),
  CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ${T}`,

`CREATE TABLE IF NOT EXISTS login_otps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  user_name VARCHAR(120) NULL,                       -- executive / admin name (filled by trigger + app)
  user_role VARCHAR(20) NULL,                        -- executive | admin
  user_phone VARCHAR(20) NULL,                       -- login mobile number
  device_hash CHAR(64) NOT NULL,
  device_label VARCHAR(255) NULL,
  code_hash CHAR(64) NOT NULL,
  code_plain VARCHAR(8) NULL,                        -- cleared after use / expiry
  attempts INT NOT NULL DEFAULT 0,
  used TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',     -- PENDING | VERIFIED | EXPIRED | FAILED
  expires_at DATETIME(3) NOT NULL,
  verified_at DATETIME(3) NULL,                      -- when the OTP was entered correctly
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_otp_user (user_id, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ${T}`,

// History of executive-to-executive sharing
`CREATE TABLE IF NOT EXISTS lead_shares (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT UNSIGNED NOT NULL,
  from_user_id INT UNSIGNED NULL,
  from_user_name VARCHAR(120) NULL,
  to_user_id INT UNSIGNED NOT NULL,
  to_user_name VARCHAR(120) NULL,
  note VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_share_lead (lead_id),
  KEY idx_share_to (to_user_id, created_at),
  CONSTRAINT fk_share_lead FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
) ${T}`,

// Editable texts / links (WhatsApp message templates, group link …)
`CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) NOT NULL,
  v MEDIUMTEXT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (k)
) ${T}`,
];
