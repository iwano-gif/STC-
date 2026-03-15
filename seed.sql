-- シードデータ（初期ユーザー・承認者マスタ）

-- 管理者（岩野）※管理者+申請者
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('admin-001', 'iwano_admin', '岩野', '321e5769d06538dba1c84d890d4f9596f6a7c9d04b9086e1b508657ad7d295b0', '["applicant","admin"]', 1);

-- 承認者①（新地 美智子 ─ 経理担当）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-001', 'shinchi.michiko', '新地 美智子', 'b8bc6112f9602be2d838d79a3b9c32cbe6106b773818eaf843f4f77b08ab583e', '["applicant","approver"]', 1);

-- 承認者②（新地 徳博 ─ 代表）
INSERT OR IGNORE INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES
  ('approver-002', 'shinchi.norihiro', '新地 徳博', '8b43c2dd350eb0602bdc6a79bf7e84c6a14aa5e6a73c8156b67ad153374fae61', '["applicant","approver"]', 1);

-- 承認者マスタ（2段階承認：経理→代表）
INSERT OR IGNORE INTO approver_master (id, user_id, step_order, label, is_active) VALUES
  ('am-001', 'approver-001', 1, '経理担当', 1),
  ('am-002', 'approver-002', 2, '代表', 1);
