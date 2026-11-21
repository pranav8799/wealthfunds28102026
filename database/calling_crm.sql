-- ============================================================
--  WealthFund Calling CRM — MySQL / MariaDB (XAMPP) database
--  How to use:  phpMyAdmin -> Import -> choose this file -> Go
--  (It creates the database "calling_crm", all tables and the first admin.)
--  First login:  Admin panel  ->  mobile 9999999999  /  password admin123
-- ============================================================

CREATE DATABASE IF NOT EXISTS `calling_crm` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `calling_crm`;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calls (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trusted_devices (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_otps (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_shares (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) NOT NULL,
  v MEDIUMTEXT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Triggers: leads.executive_name / calls.executive_name always follow users.name
DELIMITER $$
DROP TRIGGER IF EXISTS trg_leads_exec_name_ins$$
CREATE TRIGGER trg_leads_exec_name_ins BEFORE INSERT ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id),
      NEW.sold_by_name = (SELECT name FROM users WHERE id = NEW.sold_by)$$
DROP TRIGGER IF EXISTS trg_leads_exec_name_upd$$
CREATE TRIGGER trg_leads_exec_name_upd BEFORE UPDATE ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id),
      NEW.sold_by_name = (SELECT name FROM users WHERE id = NEW.sold_by)$$
DROP TRIGGER IF EXISTS trg_calls_exec_name_ins$$
CREATE TRIGGER trg_calls_exec_name_ins BEFORE INSERT ON calls FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)$$
DROP TRIGGER IF EXISTS trg_attendance_name_ins$$
CREATE TRIGGER trg_attendance_name_ins BEFORE INSERT ON attendance FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id)$$
DROP TRIGGER IF EXISTS trg_devices_name_ins$$
CREATE TRIGGER trg_devices_name_ins BEFORE INSERT ON trusted_devices FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id)$$
DROP TRIGGER IF EXISTS trg_shares_name_ins$$
CREATE TRIGGER trg_shares_name_ins BEFORE INSERT ON lead_shares FOR EACH ROW
  SET NEW.from_user_name = (SELECT name FROM users WHERE id = NEW.from_user_id),
      NEW.to_user_name = (SELECT name FROM users WHERE id = NEW.to_user_id)$$
DROP TRIGGER IF EXISTS trg_otps_name_ins$$
CREATE TRIGGER trg_otps_name_ins BEFORE INSERT ON login_otps FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id),
      NEW.user_role = (SELECT role FROM users WHERE id = NEW.user_id),
      NEW.user_phone = (SELECT phone FROM users WHERE id = NEW.user_id)$$
DROP TRIGGER IF EXISTS trg_users_name_upd$$
CREATE TRIGGER trg_users_name_upd AFTER UPDATE ON users FOR EACH ROW
  BEGIN
    IF NEW.name <> OLD.name THEN
      UPDATE leads SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE leads SET sold_by_name = NEW.name WHERE sold_by = NEW.id;
      UPDATE calls SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE attendance SET user_name = NEW.name WHERE user_id = NEW.id;
      UPDATE trusted_devices SET user_name = NEW.name WHERE user_id = NEW.id;
      UPDATE lead_shares SET from_user_name = NEW.name WHERE from_user_id = NEW.id;
      UPDATE lead_shares SET to_user_name = NEW.name WHERE to_user_id = NEW.id;
      UPDATE login_otps SET user_name = NEW.name WHERE user_id = NEW.id;
    END IF;
    IF NEW.phone <> OLD.phone THEN
      UPDATE login_otps SET user_phone = NEW.phone WHERE user_id = NEW.id;
    END IF;
  END$$
DELIMITER ;

-- First admin (change the mobile number and password after login: sidebar -> Account settings)
INSERT INTO users (name, phone, password_hash, role)
SELECT 'Admin', '9999999999', '$2a$10$0LwnHe38bH8exU76cZXNR.bOZKS4l71519oeDujrgJ6YjgUI5fofu', 'admin' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users);
