-- One private OAuth connection per form; tokens are encrypted at rest using a server-only key.
CREATE TABLE IF NOT EXISTS fs_google_sheets (
  form_id uuid PRIMARY KEY REFERENCES fs_forms(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  spreadsheet_id text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_error text
);
CREATE TABLE IF NOT EXISTS fs_sheet_deliveries (
  submission_id uuid PRIMARY KEY REFERENCES fs_submissions(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES fs_forms(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  synced_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS fs_sheet_deliveries_pending_idx ON fs_sheet_deliveries(state,claimed_at);
CREATE INDEX IF NOT EXISTS fs_sheet_deliveries_form_idx ON fs_sheet_deliveries(form_id,state);
