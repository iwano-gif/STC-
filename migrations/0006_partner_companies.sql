-- =============================================
-- 協力会社マスタ + 案件-協力会社紐づけ
-- =============================================

-- partner_companies（協力会社マスタ）
CREATE TABLE IF NOT EXISTS partner_companies (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  representative_name TEXT,        -- 代表者名
  phone TEXT,                      -- 電話番号
  address TEXT,                    -- 住所
  trade_type TEXT,                 -- 業種/工種（例: 電気工事、塗装、防水）
  notes TEXT,                      -- 備考
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_partner_companies_name ON partner_companies(company_name);
CREATE INDEX IF NOT EXISTS idx_partner_companies_active ON partner_companies(is_active);

-- deal_partners（案件-協力会社 中間テーブル）
-- 1案件に複数の協力会社を紐づけ可能
CREATE TABLE IF NOT EXISTS deal_partners (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deal_tracking(id),
  partner_id TEXT NOT NULL REFERENCES partner_companies(id),
  role TEXT NOT NULL CHECK(role IN ('prime_contractor', 'subcontractor')),
    -- prime_contractor: 元請け会社（STCが下請けの場合の上位）
    -- subcontractor: 下請け会社（STCが元請けの場合の協力会社）
  contract_amount REAL,            -- 業者ごとの契約金額（税抜）
  notes TEXT,                      -- 備考
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deal_partners_deal ON deal_partners(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_partners_partner ON deal_partners(partner_id);
CREATE INDEX IF NOT EXISTS idx_deal_partners_role ON deal_partners(role);

-- requests テーブルに元請け会社IDを追加（申請時に設定可能）
ALTER TABLE requests ADD COLUMN prime_contractor_id TEXT;
