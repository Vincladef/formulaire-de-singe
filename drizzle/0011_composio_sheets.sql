-- Migration additive; old first-party OAuth connections keep working.
-- Managed OAuth tokens remain exclusively at Composio, never in our database.
ALTER TABLE fs_google_sheets ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'legacy';
ALTER TABLE fs_google_sheets ADD COLUMN IF NOT EXISTS composio_account_id text;
ALTER TABLE fs_google_sheets ALTER COLUMN encrypted_refresh_token DROP NOT NULL;
ALTER TABLE fs_google_sheets ADD CONSTRAINT fs_google_sheets_provider_check CHECK (
  (provider='legacy' AND encrypted_refresh_token IS NOT NULL AND composio_account_id IS NULL)
  OR (provider='composio' AND encrypted_refresh_token IS NULL AND composio_account_id IS NOT NULL)
);
