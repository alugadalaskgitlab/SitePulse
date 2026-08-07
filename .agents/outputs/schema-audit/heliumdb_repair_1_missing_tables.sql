--
-- PostgreSQL database dump
--

\restrict Ec3SWzk7V9NbhCGLeXIBqGZICPVKKwAd7xHXv9h1j9RvYcBebtGfJSiJthBHdj1

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: boq_material_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boq_material_mappings (
    id integer NOT NULL,
    boq_project_id integer,
    material_label text NOT NULL,
    material_id integer NOT NULL,
    mapped_by_user_id integer,
    mapped_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    source_uom text,
    normalized_source_label text,
    conversion_mode text,
    conversion_factor_used real,
    conversion_profile_id integer,
    conversion_basis text
);


--
-- Name: boq_material_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boq_material_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boq_material_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boq_material_mappings_id_seq OWNED BY public.boq_material_mappings.id;


--
-- Name: earthwork_arrangement_programme_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earthwork_arrangement_programme_allocations (
    id integer NOT NULL,
    arrangement_id integer NOT NULL,
    programme_bar_id integer NOT NULL,
    boq_item_id integer NOT NULL,
    allocated_qty real NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: earthwork_arrangement_programme_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.earthwork_arrangement_programme_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: earthwork_arrangement_programme_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.earthwork_arrangement_programme_allocations_id_seq OWNED BY public.earthwork_arrangement_programme_allocations.id;


--
-- Name: earthwork_arrangements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earthwork_arrangements (
    id integer NOT NULL,
    boq_project_id integer NOT NULL,
    boq_item_id integer,
    material_label text NOT NULL,
    arrangement_type text DEFAULT 'not_decided'::text NOT NULL,
    agency_name text,
    work_description text,
    reach_label text,
    chainage_from real,
    chainage_to real,
    allocated_qty real DEFAULT 0 NOT NULL,
    uom text DEFAULT 'CUM'::text NOT NULL,
    agreed_rate real,
    borrow_source text,
    avg_lead_km real,
    planned_start_date text,
    target_completion_date text,
    planned_daily_output real,
    working_hours_per_shift integer,
    num_excavators integer,
    excavator_type text,
    num_tippers integer,
    tipper_capacity_cum real,
    diesel_responsibility text,
    components jsonb,
    inclusions text,
    exclusions text,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    prepared_by_user_id integer,
    submitted_at timestamp with time zone,
    approved_by_user_id integer,
    approved_at timestamp with time zone,
    rejection_reason text,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    boq_item_allocations jsonb,
    mobilisation_date text,
    actual_start_date text,
    returned_at timestamp without time zone,
    on_hold_reason text,
    completed_at timestamp without time zone,
    source_excavation_boq_item_id integer,
    pending_revision jsonb,
    revision_history jsonb,
    work_category text DEFAULT 'earthwork'::text,
    bituminous_item_type text
);


--
-- Name: earthwork_arrangements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.earthwork_arrangements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: earthwork_arrangements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.earthwork_arrangements_id_seq OWNED BY public.earthwork_arrangements.id;


--
-- Name: earthwork_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earthwork_baselines (
    id integer NOT NULL,
    boq_project_id integer NOT NULL,
    boq_item_id integer NOT NULL,
    original_start text,
    original_finish text,
    original_duration_days integer,
    original_qty real,
    captured_at timestamp without time zone DEFAULT now(),
    captured_by_user_id integer,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: earthwork_baselines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.earthwork_baselines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: earthwork_baselines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.earthwork_baselines_id_seq OWNED BY public.earthwork_baselines.id;


--
-- Name: earthwork_forecasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earthwork_forecasts (
    id integer NOT NULL,
    boq_project_id integer NOT NULL,
    boq_item_id integer NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    effective_date text,
    balance_qty real,
    forecast_start_date text,
    planned_daily_output real,
    expected_working_days integer,
    forecast_finish_date text,
    delay_reason_code text,
    delay_reason_other text,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    prepared_by_user_id integer,
    approved_by_user_id integer,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: earthwork_forecasts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.earthwork_forecasts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: earthwork_forecasts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.earthwork_forecasts_id_seq OWNED BY public.earthwork_forecasts.id;


--
-- Name: material_requirement_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_requirement_allocations (
    id integer NOT NULL,
    requirement_id integer NOT NULL,
    allocation_type text NOT NULL,
    authorized_qty real NOT NULL,
    status text DEFAULT 'authorized'::text NOT NULL,
    linked_document_type text,
    linked_document_id integer,
    linked_document_item_id integer,
    authorized_by_user_id integer,
    authorized_at timestamp without time zone DEFAULT now(),
    reason text,
    linked_at timestamp without time zone,
    committed_qty real DEFAULT 0 NOT NULL,
    fulfilled_qty real DEFAULT 0 NOT NULL,
    cancelled_qty real DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: material_requirement_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_requirement_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_requirement_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_requirement_allocations_id_seq OWNED BY public.material_requirement_allocations.id;


--
-- Name: material_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_requirements (
    id integer NOT NULL,
    material_id integer,
    required_qty real NOT NULL,
    uom text NOT NULL,
    required_by_date date,
    destination_type text DEFAULT 'hmp'::text NOT NULL,
    destination_site_id integer,
    boq_project_id integer,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_boq_item_id integer,
    allocated_qty real DEFAULT 0 NOT NULL,
    ordered_qty real DEFAULT 0 NOT NULL,
    received_qty real DEFAULT 0 NOT NULL,
    balance_qty real DEFAULT 0 NOT NULL,
    status text DEFAULT 'raised'::text NOT NULL,
    created_by_user_id integer,
    created_at timestamp without time zone DEFAULT now(),
    reviewed_by text,
    reviewed_at timestamp without time zone,
    remarks text,
    material_type text DEFAULT 'plant_material'::text NOT NULL,
    store_item_id integer,
    destination_plant_id integer,
    client_request_id text,
    internally_allocated_qty real DEFAULT 0 NOT NULL,
    internally_issued_qty real DEFAULT 0 NOT NULL,
    procurement_requested_qty real DEFAULT 0 NOT NULL,
    unallocated_balance_qty real DEFAULT 0 NOT NULL,
    physically_unfulfilled_qty real DEFAULT 0 NOT NULL
);


--
-- Name: material_requirements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_requirements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_requirements_id_seq OWNED BY public.material_requirements.id;


--
-- Name: material_uom_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_uom_conversions (
    id integer NOT NULL,
    material_id integer NOT NULL,
    from_uom text NOT NULL,
    to_uom text NOT NULL,
    conversion_factor real NOT NULL,
    conversion_basis text,
    conversion_type text DEFAULT 'fixed_factor'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    effective_from timestamp without time zone,
    effective_to timestamp without time zone,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: material_uom_conversions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_uom_conversions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_uom_conversions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_uom_conversions_id_seq OWNED BY public.material_uom_conversions.id;


--
-- Name: pending_plant_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_plant_receipts (
    id integer NOT NULL,
    indent_id integer NOT NULL,
    indent_no text,
    indent_item_id integer NOT NULL,
    material_name text NOT NULL,
    material_id integer,
    qty real NOT NULL,
    uom text NOT NULL,
    vendor text,
    rate real,
    payment_mode text,
    paid_by text,
    purchase_date date,
    receiving_location text DEFAULT 'hmp_plant'::text NOT NULL,
    receiving_site_id integer,
    remarks text,
    created_by_user_id integer NOT NULL,
    created_by text NOT NULL,
    site_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_by_user_id integer,
    confirmed_by text,
    confirmed_at timestamp without time zone,
    rejection_reason text,
    linked_receipt_id integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pending_plant_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pending_plant_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pending_plant_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pending_plant_receipts_id_seq OWNED BY public.pending_plant_receipts.id;


--
-- Name: project_scope_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_scope_segments (
    id integer NOT NULL,
    boq_project_id integer NOT NULL,
    segment_type text NOT NULL,
    label text,
    chainage_from real NOT NULL,
    chainage_to real NOT NULL,
    side text,
    reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    applicability text DEFAULT 'all_linear'::text NOT NULL,
    category_ids text,
    item_ids text,
    effective_from date,
    effective_to date,
    dept_reference text,
    document_ref text,
    notes text,
    withdrawal_order_ref text,
    consent_ref text,
    omitted_qty text,
    omitted_amount text,
    original_scope_note text,
    revised_scope_note text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    approved_by integer,
    approved_at timestamp without time zone,
    revision_of integer
);


--
-- Name: project_scope_segments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_scope_segments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_scope_segments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_scope_segments_id_seq OWNED BY public.project_scope_segments.id;


--
-- Name: service_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_completions (
    id integer NOT NULL,
    indent_id integer NOT NULL,
    indent_item_id integer NOT NULL,
    item_description text,
    completion_status text NOT NULL,
    completion_date date,
    qty real,
    hours real,
    remarks text,
    document_url text,
    verified_by_user_id integer,
    verified_by_name text,
    created_by_user_id integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: service_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_completions_id_seq OWNED BY public.service_completions.id;


--
-- Name: stock_reconciliation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_reconciliation_items (
    id integer NOT NULL,
    session_id integer NOT NULL,
    material_id integer NOT NULL,
    party_id integer,
    old_balance numeric(20,6) NOT NULL,
    physical_qty numeric(20,6) NOT NULL,
    adjustment numeric(20,6) NOT NULL,
    source_qty numeric(20,6) NOT NULL,
    source_uom text NOT NULL,
    conversion_factor numeric(20,9),
    base_uom text,
    reason text NOT NULL,
    note text,
    ledger_entry_id integer,
    verified_no_change integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: stock_reconciliation_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_reconciliation_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_reconciliation_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_reconciliation_items_id_seq OWNED BY public.stock_reconciliation_items.id;


--
-- Name: stock_reconciliation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_reconciliation_sessions (
    id integer NOT NULL,
    ref_no text DEFAULT ''::text NOT NULL,
    count_date date NOT NULL,
    posted_by text NOT NULL,
    posted_at timestamp without time zone DEFAULT now(),
    client_request_id text,
    notes text,
    status text DEFAULT 'posted'::text NOT NULL,
    draft_rows text,
    prepared_by text,
    prepared_at timestamp without time zone,
    updated_at timestamp without time zone,
    rejection_note text
);


--
-- Name: stock_reconciliation_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_reconciliation_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_reconciliation_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_reconciliation_sessions_id_seq OWNED BY public.stock_reconciliation_sessions.id;


--
-- Name: boq_material_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_material_mappings ALTER COLUMN id SET DEFAULT nextval('public.boq_material_mappings_id_seq'::regclass);


--
-- Name: earthwork_arrangement_programme_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangement_programme_allocations ALTER COLUMN id SET DEFAULT nextval('public.earthwork_arrangement_programme_allocations_id_seq'::regclass);


--
-- Name: earthwork_arrangements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangements ALTER COLUMN id SET DEFAULT nextval('public.earthwork_arrangements_id_seq'::regclass);


--
-- Name: earthwork_baselines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_baselines ALTER COLUMN id SET DEFAULT nextval('public.earthwork_baselines_id_seq'::regclass);


--
-- Name: earthwork_forecasts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_forecasts ALTER COLUMN id SET DEFAULT nextval('public.earthwork_forecasts_id_seq'::regclass);


--
-- Name: material_requirement_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirement_allocations ALTER COLUMN id SET DEFAULT nextval('public.material_requirement_allocations_id_seq'::regclass);


--
-- Name: material_requirements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirements ALTER COLUMN id SET DEFAULT nextval('public.material_requirements_id_seq'::regclass);


--
-- Name: material_uom_conversions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_uom_conversions ALTER COLUMN id SET DEFAULT nextval('public.material_uom_conversions_id_seq'::regclass);


--
-- Name: pending_plant_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_plant_receipts ALTER COLUMN id SET DEFAULT nextval('public.pending_plant_receipts_id_seq'::regclass);


--
-- Name: project_scope_segments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_scope_segments ALTER COLUMN id SET DEFAULT nextval('public.project_scope_segments_id_seq'::regclass);


--
-- Name: service_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_completions ALTER COLUMN id SET DEFAULT nextval('public.service_completions_id_seq'::regclass);


--
-- Name: stock_reconciliation_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items ALTER COLUMN id SET DEFAULT nextval('public.stock_reconciliation_items_id_seq'::regclass);


--
-- Name: stock_reconciliation_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_sessions ALTER COLUMN id SET DEFAULT nextval('public.stock_reconciliation_sessions_id_seq'::regclass);


--
-- Name: boq_material_mappings boq_material_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_material_mappings
    ADD CONSTRAINT boq_material_mappings_pkey PRIMARY KEY (id);


--
-- Name: earthwork_arrangement_programme_allocations earthwork_arrangement_programme_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangement_programme_allocations
    ADD CONSTRAINT earthwork_arrangement_programme_allocations_pkey PRIMARY KEY (id);


--
-- Name: earthwork_arrangements earthwork_arrangements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangements
    ADD CONSTRAINT earthwork_arrangements_pkey PRIMARY KEY (id);


--
-- Name: earthwork_baselines earthwork_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_baselines
    ADD CONSTRAINT earthwork_baselines_pkey PRIMARY KEY (id);


--
-- Name: earthwork_forecasts earthwork_forecasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_forecasts
    ADD CONSTRAINT earthwork_forecasts_pkey PRIMARY KEY (id);


--
-- Name: material_requirement_allocations material_requirement_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirement_allocations
    ADD CONSTRAINT material_requirement_allocations_pkey PRIMARY KEY (id);


--
-- Name: material_requirements material_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirements
    ADD CONSTRAINT material_requirements_pkey PRIMARY KEY (id);


--
-- Name: material_uom_conversions material_uom_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_uom_conversions
    ADD CONSTRAINT material_uom_conversions_pkey PRIMARY KEY (id);


--
-- Name: pending_plant_receipts pending_plant_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_plant_receipts
    ADD CONSTRAINT pending_plant_receipts_pkey PRIMARY KEY (id);


--
-- Name: project_scope_segments project_scope_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_scope_segments
    ADD CONSTRAINT project_scope_segments_pkey PRIMARY KEY (id);


--
-- Name: service_completions service_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_completions
    ADD CONSTRAINT service_completions_pkey PRIMARY KEY (id);


--
-- Name: stock_reconciliation_items stock_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: stock_reconciliation_sessions stock_reconciliation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_sessions
    ADD CONSTRAINT stock_reconciliation_sessions_pkey PRIMARY KEY (id);


--
-- Name: boq_material_mappings_label_project_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX boq_material_mappings_label_project_uq ON public.boq_material_mappings USING btree (COALESCE(boq_project_id, '-1'::integer), material_label);


--
-- Name: idx_scope_segments_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scope_segments_project ON public.project_scope_segments USING btree (boq_project_id);


--
-- Name: material_requirements_client_request_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX material_requirements_client_request_id_uq ON public.material_requirements USING btree (client_request_id) WHERE (client_request_id IS NOT NULL);


--
-- Name: muom_mat_from_to_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX muom_mat_from_to_uq ON public.material_uom_conversions USING btree (material_id, from_uom, to_uom) WHERE (is_active = 1);


--
-- Name: stock_recon_items_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_recon_items_session_idx ON public.stock_reconciliation_items USING btree (session_id);


--
-- Name: stock_recon_sessions_client_request_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_recon_sessions_client_request_uq ON public.stock_reconciliation_sessions USING btree (client_request_id);


--
-- Name: earthwork_arrangement_programme_allocations earthwork_arrangement_programme_allocatio_programme_bar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangement_programme_allocations
    ADD CONSTRAINT earthwork_arrangement_programme_allocatio_programme_bar_id_fkey FOREIGN KEY (programme_bar_id) REFERENCES public.work_program_bars(id) ON DELETE CASCADE;


--
-- Name: earthwork_arrangement_programme_allocations earthwork_arrangement_programme_allocations_arrangement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earthwork_arrangement_programme_allocations
    ADD CONSTRAINT earthwork_arrangement_programme_allocations_arrangement_id_fkey FOREIGN KEY (arrangement_id) REFERENCES public.earthwork_arrangements(id) ON DELETE CASCADE;


--
-- Name: material_requirement_allocations material_requirement_allocations_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirement_allocations
    ADD CONSTRAINT material_requirement_allocations_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.material_requirements(id) ON DELETE CASCADE;


--
-- Name: material_requirements material_requirements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirements
    ADD CONSTRAINT material_requirements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.plant_materials(id);


--
-- Name: material_requirements material_requirements_store_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requirements
    ADD CONSTRAINT material_requirements_store_item_id_fkey FOREIGN KEY (store_item_id) REFERENCES public.store_items(id);


--
-- Name: project_scope_segments project_scope_segments_boq_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_scope_segments
    ADD CONSTRAINT project_scope_segments_boq_project_id_fkey FOREIGN KEY (boq_project_id) REFERENCES public.boq_projects(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Ec3SWzk7V9NbhCGLeXIBqGZICPVKKwAd7xHXv9h1j9RvYcBebtGfJSiJthBHdj1

