-- Uppercase only approved BOQ project business labels.
-- Contract numbers, BOQ descriptions, units, codes, and narrative text are
-- intentionally excluded. The WHERE clause makes this safe to run repeatedly.
UPDATE boq_projects
SET
  name = UPPER(REGEXP_REPLACE(BTRIM(name), '[[:space:]]+', ' ', 'g')),
  client = CASE
    WHEN client IS NULL THEN NULL
    ELSE UPPER(REGEXP_REPLACE(BTRIM(client), '[[:space:]]+', ' ', 'g'))
  END,
  contractor = CASE
    WHEN contractor IS NULL THEN NULL
    ELSE UPPER(REGEXP_REPLACE(BTRIM(contractor), '[[:space:]]+', ' ', 'g'))
  END
WHERE name IS DISTINCT FROM UPPER(REGEXP_REPLACE(BTRIM(name), '[[:space:]]+', ' ', 'g'))
   OR client IS DISTINCT FROM CASE
        WHEN client IS NULL THEN NULL
        ELSE UPPER(REGEXP_REPLACE(BTRIM(client), '[[:space:]]+', ' ', 'g'))
      END
   OR contractor IS DISTINCT FROM CASE
        WHEN contractor IS NULL THEN NULL
        ELSE UPPER(REGEXP_REPLACE(BTRIM(contractor), '[[:space:]]+', ' ', 'g'))
      END;