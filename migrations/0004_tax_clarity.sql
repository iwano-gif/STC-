-- =============================================
-- 案件トラッキング：税込・税抜の明確化
-- =============================================
-- 設計方針:
--   ・粗利計算は全て「税抜」ベースで統一
--   ・粗利 = 税抜契約額 - 原価（税抜）
--   ・contract_amount（既存）= 税込契約額
--   ・contract_amount_excl_tax（新規）= 税抜契約額
--   ・cost_amount（既存）= 原価（税抜）
--   ・contract_tax_rate（新規）= 契約の税率（0.10 or 0.08）

ALTER TABLE deal_tracking ADD COLUMN contract_amount_excl_tax REAL;  -- 税抜契約額
ALTER TABLE deal_tracking ADD COLUMN contract_tax_rate REAL DEFAULT 0.10;  -- 契約の税率
