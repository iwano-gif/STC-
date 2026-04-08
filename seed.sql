-- シードデータ（初期ユーザー・承認者マスタ）

-- 管理者（岩野）※管理者+申請者
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('admin-001', 'iwano_admin', '岩野 太亮', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","admin"]', 1);

-- 承認者①（新地 美智子 ─ 経理担当）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-001', 'shinchi.michiko', '新地 美智子', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","approver"]', 1);

-- 承認者②（新地 徳博 ─ 代表）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-002', 'shinchi.norihiro', '新地 徳博', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '["applicant","approver"]', 1);

-- 承認者マスタ（2段階承認：経理→代表）
INSERT OR IGNORE INTO approver_master (id, user_id, step_order, label, is_active) VALUES
  ('am-001', 'approver-001', 1, '経理担当', 1),
  ('am-002', 'approver-002', 2, '代表', 1);
