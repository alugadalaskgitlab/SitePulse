-- VB-01: additive, nullable per-bill payment and approval snapshot fields.
-- No historic rows are rewritten: legacy paid bills are interpreted as fully
-- paid at read time, while newly created equipment-hire bills start at zero.
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS net_payable_amount numeric(14,2);
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2);
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS payment_account_key text;

-- A deliberately small, stable selector list. This is not a bank ledger.
INSERT INTO app_settings (key, value)
VALUES (
  'vendor_bill_company_accounts',
  '[{"id":"bank_of_baroda_od","name":"Bank of Baroda - OD","type":"OD"},{"id":"hdfc_ca","name":"HDFC - CA","type":"CA"}]'
)
ON CONFLICT (key) DO NOTHING;