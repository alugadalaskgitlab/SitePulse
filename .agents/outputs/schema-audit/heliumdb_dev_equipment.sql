--
-- PostgreSQL database dump
--

\restrict gHQpTyt91KDqGctol9djGC6VnszJ1N4KyVnAoQJLJLdgYB7pA3onIIANuPszqWM

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
-- Name: equipment_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.equipment_logs (
    id integer NOT NULL,
    dpr_id integer NOT NULL,
    machine text NOT NULL,
    operator text,
    start_time text,
    end_time text,
    diesel real,
    task text,
    opening_reading real,
    closing_reading real,
    hours_worked real,
    diesel_norm real,
    expected_diesel real,
    vehicle_no text,
    equipment_id integer,
    diesel_source text DEFAULT 'plant_stock'::text,
    fuel_station text,
    bill_number text,
    amount_paid real,
    entry_type text DEFAULT 'time_meter'::text,
    number_of_trips integer,
    trip_distance real,
    total_km real,
    water_quantity real,
    boq_item_id integer,
    structure_id text
);


ALTER TABLE public.equipment_logs OWNER TO postgres;

--
-- Name: equipment_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.equipment_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.equipment_logs_id_seq OWNER TO postgres;

--
-- Name: equipment_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.equipment_logs_id_seq OWNED BY public.equipment_logs.id;


--
-- Name: equipment_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.equipment_usage (
    id integer NOT NULL,
    date date NOT NULL,
    equipment_id integer NOT NULL,
    opening_reading real,
    closing_reading real,
    hours_or_km_run real,
    diesel_issued real,
    expected_diesel real,
    variance real,
    remarks text,
    created_at timestamp without time zone DEFAULT now(),
    opening_diesel real,
    closing_diesel real,
    start_time text,
    end_time text,
    diesel_included boolean DEFAULT false,
    number_of_trips integer,
    trip_distance real,
    total_km real,
    trip_based_entry boolean DEFAULT false,
    dpr_id integer,
    site_name text,
    operator text,
    task text,
    diesel_source text DEFAULT 'plant_stock'::text,
    fuel_station text,
    bill_number text,
    amount_paid real,
    diesel_balance_in_tank real,
    diesel_balance_confirmed boolean DEFAULT false,
    entry_type text DEFAULT 'time_meter'::text,
    shift_from text,
    shift_to text,
    transport_equipment_id integer,
    transport_distance real,
    plant_name text DEFAULT 'Main Plant'::text NOT NULL,
    source_heating_session_id integer,
    author_user_id integer,
    lock_status text DEFAULT 'locked'::text NOT NULL,
    unlocked_by_user_id integer,
    unlocked_at timestamp without time zone,
    unlock_reason text,
    hire_amount real
);


ALTER TABLE public.equipment_usage OWNER TO postgres;

--
-- Name: equipment_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.equipment_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.equipment_usage_id_seq OWNER TO postgres;

--
-- Name: equipment_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.equipment_usage_id_seq OWNED BY public.equipment_usage.id;


--
-- Name: equipment_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.equipment_logs ALTER COLUMN id SET DEFAULT nextval('public.equipment_logs_id_seq'::regclass);


--
-- Name: equipment_usage id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.equipment_usage ALTER COLUMN id SET DEFAULT nextval('public.equipment_usage_id_seq'::regclass);


--
-- Name: equipment_logs equipment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.equipment_logs
    ADD CONSTRAINT equipment_logs_pkey PRIMARY KEY (id);


--
-- Name: equipment_usage equipment_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_pkey PRIMARY KEY (id);


--
-- Name: equipment_usage_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX equipment_usage_date_idx ON public.equipment_usage USING btree (date);


--
-- Name: equipment_usage_source_heating_session_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX equipment_usage_source_heating_session_idx ON public.equipment_usage USING btree (source_heating_session_id);


--
-- PostgreSQL database dump complete
--

\unrestrict gHQpTyt91KDqGctol9djGC6VnszJ1N4KyVnAoQJLJLdgYB7pA3onIIANuPszqWM

