-- 申請テーブルに下請け会社IDs（JSON配列）を追加
ALTER TABLE requests ADD COLUMN subcontractor_ids TEXT;
