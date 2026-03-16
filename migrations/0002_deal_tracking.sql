-- =============================================
-- 案件トラッキング（見積もり→契約→工事→入金）
-- =============================================

-- deal_tracking（案件進捗管理）
-- 承認完了した見積もり申請に対して、契約〜入金までの進捗を管理する
CREATE TABLE IF NOT EXISTS deal_tracking (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  -- パイプラインステータス
  deal_status TEXT NOT NULL DEFAULT 'estimate_approved' CHECK(deal_status IN (
    'estimate_approved',  -- 見積承認済み（初期状態）
    'contracted',         -- 契約済み
    'construction',       -- 工事中
    'construction_done',  -- 工事完了
    'invoiced',           -- 請求済み
    'payment_received',   -- 入金済み
    'lost'                -- 失注
  )),
  -- 契約情報
  contract_date TEXT,         -- 契約日
  contract_amount REAL,       -- 契約金額（税込）
  -- 工事情報
  construction_start TEXT,    -- 工事開始日
  construction_end TEXT,      -- 工事完了日（予定 or 実績）
  -- 請求・入金情報
  invoice_date TEXT,          -- 請求日
  invoice_amount REAL,        -- 請求金額（税込）
  payment_due_date TEXT,      -- 入金期限
  payment_date TEXT,          -- 実際の入金日
  payment_amount REAL,        -- 入金額
  -- メモ
  notes TEXT,
  -- タイムスタンプ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_deal_tracking_request ON deal_tracking(request_id);
CREATE INDEX IF NOT EXISTS idx_deal_tracking_status ON deal_tracking(deal_status);
CREATE INDEX IF NOT EXISTS idx_deal_tracking_payment_due ON deal_tracking(payment_due_date);
