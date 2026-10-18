ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS payment_account_key text;

INSERT INTO app_settings AS target_setting (key, value)
VALUES (
  'vendor_bill_company_accounts',
  '[{"id":"bank_of_baroda_od","name":"Bank of Baroda - OD","type":"OD","source":"own"},{"id":"hdfc_ca","name":"HDFC - CA","type":"CA","source":"own"},{"id":"alps_infra_works","name":"ALPS Infra - Union Bank (works)","type":"CC","source":"third_party"}]'
)
ON CONFLICT (key) DO UPDATE
SET value = (
  SELECT (
    COALESCE(
      jsonb_agg(
        CASE
          WHEN account ? 'source' THEN account
          ELSE account || '{"source":"own"}'::jsonb
        END
        ORDER BY ordinal
      ),
      '[]'::jsonb
    )
    || CASE
      WHEN COALESCE(bool_or(account ->> 'id' = 'alps_infra_works'), false) THEN '[]'::jsonb
      ELSE '[{"id":"alps_infra_works","name":"ALPS Infra - Union Bank (works)","type":"CC","source":"third_party"}]'::jsonb
    END
  )::text
  FROM jsonb_array_elements(target_setting.value::jsonb) WITH ORDINALITY AS existing_accounts(account, ordinal)
);
