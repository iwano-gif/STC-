-- 申請テーブルに下請け会社IDs（JSON配列）を追加
-- NOTE: ALTER TABLE ADD COLUMN IF NOT EXISTS not supported in SQLite
-- Column may already exist if manually applied
ALTER TABLE requests ADD COLUMN subcontractor_ids TEXT;
