-- =============================================
-- 申請承認ワークフロー データベーススキーマ
-- =============================================

-- profiles（ユーザー情報）
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '["applicant"]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- requests（申請データ）
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  request_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('estimate', 'invoice')),
  applicant_id TEXT NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  tax_rate REAL NOT NULL CHECK(tax_rate IN (0.10, 0.08, 0.0)),
  amount_with_tax REAL NOT NULL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'rejected', 'completed', 'processed', 'withdrawn')),
  current_step INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- approval_steps（承認ステップ）
CREATE TABLE IF NOT EXISTS approval_steps (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  step_order INTEGER NOT NULL,
  approver_id TEXT NOT NULL REFERENCES profiles(id),
  approver_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'approved', 'rejected', 'skipped')),
  comment TEXT,
  decided_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- approver_master（承認者マスタ）
CREATE TABLE IF NOT EXISTS approver_master (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id),
  step_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- request_files（添付ファイル）
CREATE TABLE IF NOT EXISTS request_files (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- notification_logs（通知ログ）
CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES requests(id),
  recipient_email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_detail TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- audit_logs（監査ログ）
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- settings（システム設定）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- request_number用シーケンス管理
CREATE TABLE IF NOT EXISTS sequences (
  name TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL DEFAULT 0
);

-- =============================================
-- インデックス
-- =============================================
CREATE INDEX IF NOT EXISTS idx_requests_applicant ON requests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_approval_steps_request ON approval_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver ON approval_steps(approver_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_status ON approval_steps(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_approver_master_user ON approver_master(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_request ON notification_logs(request_id);

-- =============================================
-- 初期データ
-- =============================================
INSERT OR IGNORE INTO sequences (name, current_value) VALUES ('request_number', 0);

INSERT OR IGNORE INTO settings (key, value) VALUES 
  ('clerk_emails', '["jimu@example.com"]'),
  ('system_name', '"申請承認ワークフロー"'),
  ('reminder_hours', '48'),
  ('reminder_max_count', '3');