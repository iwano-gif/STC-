-- シードデータ（デモ用ユーザー・承認者マスタ）
-- パスワードは全て "password123" のSHA-256ハッシュ

-- 管理者
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('admin-001', 'admin@example.com', '岩野 管理者', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","approver","admin"]', 1);

-- 承認者1（経理）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-001', 'suzuki@example.com', '鈴木 一郎', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","approver"]', 1);

-- 承認者2（事業部長）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-002', 'takahashi@example.com', '高橋 部長', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","approver"]', 1);

-- 事務員
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('clerk-001', 'yamamoto@example.com', '山本 事務', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","clerk"]', 1);

-- 一般申請者
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('user-001', 'sato@example.com', '佐藤 花子', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant"]', 1);

INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('user-002', 'tanaka@example.com', '田中 一郎', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant"]', 1);

-- 承認者マスタ（3段階承認）
INSERT OR IGNORE INTO approver_master (id, user_id, step_order, label, is_active) VALUES
  ('am-001', 'approver-001', 1, '経理担当', 1),
  ('am-002', 'approver-002', 2, '事業部長', 1),
  ('am-003', 'admin-001', 3, '管理部', 1);