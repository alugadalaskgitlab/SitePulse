CREATE TABLE public.vendor_hire_advance_ledger (
  id serial PRIMARY KEY,
  vendor_id integer,
  site_id integer,
  kind text,
  amount numeric(14,2),
  effective_date date,
  reference text,
  bill_id integer,
  hire_statement_id integer,
  client_request_id text,
  created_by_user_id integer,
  created_by text,
  created_at timestamp DEFAULT now(),
  CONSTRAINT vendor_hire_advance_ledger_vendor_id_vendors_id_fk
    FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT,
  CONSTRAINT vendor_hire_advance_ledger_site_id_sites_id_fk
    FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL,
  CONSTRAINT vendor_hire_advance_ledger_bill_id_vendor_bills_id_fk
    FOREIGN KEY (bill_id) REFERENCES public.vendor_bills(id) ON DELETE SET NULL,
  CONSTRAINT vendor_hire_advance_ledger_hire_statement_id_hire_statements_id_fk
    FOREIGN KEY (hire_statement_id) REFERENCES public.hire_statements(id) ON DELETE SET NULL
);

CREATE INDEX vendor_hire_advance_ledger_vendor_date_idx
  ON public.vendor_hire_advance_ledger (vendor_id, effective_date, id);

CREATE UNIQUE INDEX vendor_hire_advance_ledger_recovery_statement_uq
  ON public.vendor_hire_advance_ledger (hire_statement_id)
  WHERE kind = 'recovery' AND hire_statement_id IS NOT NULL;

CREATE UNIQUE INDEX vendor_hire_advance_ledger_opening_vendor_uq
  ON public.vendor_hire_advance_ledger (vendor_id)
  WHERE kind = 'opening_balance' AND vendor_id IS NOT NULL;

CREATE UNIQUE INDEX vendor_hire_advance_ledger_client_request_uq
  ON public.vendor_hire_advance_ledger (client_request_id)
  WHERE client_request_id IS NOT NULL;
