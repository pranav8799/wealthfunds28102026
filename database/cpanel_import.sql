-- ============================================================
--  Calling CRM — cPanel phpMyAdmin Import Script
--  Usage in cPanel phpMyAdmin:
--    1. In phpMyAdmin, click on your created database (e.g. username_callingcrm) on the left sidebar
--    2. Click the "Import" tab at the top
--    3. Choose this file (cpanel_import.sql) and click "Go"
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','executive') NOT NULL DEFAULT 'executive',
  active TINYINT(1) NOT NULL DEFAULT 1,
  zoom_link VARCHAR(500) NULL,
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
  status VARCHAR(20) NOT NULL DEFAULT 'NEW',
  executive_id INT UNSIGNED NULL,
  executive_name VARCHAR(120) NULL,
  remark TEXT NULL,
  call_count INT NOT NULL DEFAULT 0,
  group_joined TINYINT(1) NOT NULL DEFAULT 0,
  webinar_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  account_status VARCHAR(20) NOT NULL DEFAULT 'NOT_OPENED',
  followup_at DATETIME(3) NULL,
  last_called_at DATETIME(3) NULL,
  interested_at DATETIME(3) NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'manual',
  import_label VARCHAR(255) NULL,
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
  CONSTRAINT fk_leads_exec FOREIGN KEY (executive_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calls (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT UNSIGNED NOT NULL,
  executive_id INT UNSIGNED NOT NULL,
  executive_name VARCHAR(120) NULL,
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
  device_hash CHAR(64) NOT NULL,
  device_label VARCHAR(255) NULL,
  code_hash CHAR(64) NOT NULL,
  code_plain VARCHAR(8) NULL,
  attempts INT NOT NULL DEFAULT 0,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_otp_user (user_id, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_shares (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT UNSIGNED NOT NULL,
  from_user_id INT UNSIGNED NULL,
  to_user_id INT UNSIGNED NOT NULL,
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
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)$$
DROP TRIGGER IF EXISTS trg_leads_exec_name_upd$$
CREATE TRIGGER trg_leads_exec_name_upd BEFORE UPDATE ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)$$
DROP TRIGGER IF EXISTS trg_calls_exec_name_ins$$
CREATE TRIGGER trg_calls_exec_name_ins BEFORE INSERT ON calls FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)$$
DROP TRIGGER IF EXISTS trg_users_name_upd$$
CREATE TRIGGER trg_users_name_upd AFTER UPDATE ON users FOR EACH ROW
  BEGIN
    IF NEW.name <> OLD.name THEN
      UPDATE leads SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE calls SET executive_name = NEW.name WHERE executive_id = NEW.id;
    END IF;
  END$$
DELIMITER ;

-- Default Admin user: Phone 9999999999, Password admin123
INSERT INTO users (name, phone, password_hash, role)
SELECT 'Admin', '9999999999', '$2a$10$4R/QiRJKfsbP.LLRkXXwA.K8smclY5EpRfx6nbowPmQ37ueCbHuAW', 'admin' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users);
