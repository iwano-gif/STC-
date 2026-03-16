-- 申請時に粗利率を入力可能にする
-- gross_profit_rate: 粗利率（0〜100の整数値、例: 20 = 20%）
ALTER TABLE requests ADD COLUMN gross_profit_rate REAL;
