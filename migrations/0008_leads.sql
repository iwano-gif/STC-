-- リード（商談）管理テーブル
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  lead_name TEXT NOT NULL,
  client_name TEXT,
  contact_info TEXT,
  estimated_amount REAL,
  estimated_profit_rate REAL,
  stage TEXT NOT NULL DEFAULT 'inquiry',
  probability INTEGER,
  source TEXT,
  prime_contractor_id TEXT,
  notes TEXT,
  expected_date TEXT,
  owner_id TEXT NOT NULL,
  request_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (prime_contractor_id) REFERENCES partner_companies(id),
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- リード活動ログテーブル
CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  content TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at);
