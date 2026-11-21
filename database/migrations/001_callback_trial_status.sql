-- ============================================================
-- Migration 001: Callback, Trial, Status expansion, OTP polish
-- Safe, additive, preserves all existing data and records
-- Run once on your existing calling_crm database
-- ============================================================

START TRANSACTION;

-- 1. Expand lead status + trial / sold fields
ALTER TABLE leads
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'NEW';

-- Add new columns only if they do not already exist
SET @db := DATABASE();

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='trial_days');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD COLUMN trial_days INT UNSIGNED NULL COMMENT ''custom trial duration in days'' AFTER interested_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='trial_started_at');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD COLUMN trial_started_at DATETIME(3) NULL AFTER trial_days',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='trial_ends_at');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD COLUMN trial_ends_at DATETIME(3) NULL AFTER trial_started_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='sold_at');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD COLUMN sold_at DATETIME(3) NULL AFTER trial_ends_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='sold_by');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD COLUMN sold_by INT UNSIGNED NULL AFTER sold_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Indexes for performance (ignore if already present)
SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND INDEX_NAME='idx_leads_followup');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD INDEX idx_leads_followup (status, followup_at)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND INDEX_NAME='idx_leads_trial');
SET @sql := IF(@exists=0,
  'ALTER TABLE leads ADD INDEX idx_leads_trial (trial_ends_at)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. login_otps: show name + clear status (Pending / Verified / Expired / Failed)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='login_otps' AND COLUMN_NAME='user_name');
SET @sql := IF(@exists=0,
  'ALTER TABLE login_otps ADD COLUMN user_name VARCHAR(120) NULL AFTER user_id',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='login_otps' AND COLUMN_NAME='status');
SET @sql := IF(@exists=0,
  'ALTER TABLE login_otps ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''PENDING'' AFTER used',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill existing OTP rows
UPDATE login_otps o
  LEFT JOIN users u ON u.id = o.user_id
  SET o.user_name = COALESCE(o.user_name, u.name),
      o.status = CASE
        WHEN o.used = 1 THEN 'VERIFIED'
        WHEN o.expires_at < NOW(3) THEN 'EXPIRED'
        ELSE 'PENDING'
      END
  WHERE o.user_name IS NULL OR o.status = 'PENDING';

-- Never keep plaintext OTPs longer than needed (security)
UPDATE login_otps SET code_plain = NULL WHERE used = 1 OR expires_at < NOW(3);

COMMIT;
