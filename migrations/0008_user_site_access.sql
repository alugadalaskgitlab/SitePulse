CREATE TABLE IF NOT EXISTS user_site_access (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'full',
  CONSTRAINT user_site_access_user_site_uq UNIQUE (user_id, site_id)
);
