-- =============================================
-- 案件トラッキング拡張：利益率 + 分割入金
-- =============================================

-- deal_tracking に原価・利益率カラムを追加
ALTER TABLE deal_tracking ADD COLUMN cost_amount REAL;          -- 原価（税抜）
ALTER TABLE deal_tracking ADD COLUMN profit_rate REAL;          -- 利益率（0.0〜1.0）

-- deal_payments（分割入金: 着手金・中間金・完了金など）
CREATE TABLE IF NOT EXISTS deal_payments (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deal_tracking(id),
  payment_type TEXT NOT NULL CHECK(payment_type IN (
    'advance',     -- 着手金
    'interim',     -- 中間金
    'final',       -- 完了金（残金）
    'other'        -- その他
  )),
  label TEXT NOT NULL,                -- 表示名（例: "着手金 30%"）
  expected_amount REAL,               -- 請求予定額
  expected_date TEXT,                 -- 入金予定日
  actual_amount REAL,                 -- 実際の入金額
  actual_date TEXT,                   -- 実際の入金日
  invoice_date TEXT,                  -- 請求日
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deal_payments_deal ON deal_payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_payments_expected ON deal_payments(expected_date);
CREATE INDEX IF NOT EXISTS idx_deal_payments_type ON deal_payments(payment_type);
