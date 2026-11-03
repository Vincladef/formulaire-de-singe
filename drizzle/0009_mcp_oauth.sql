-- MCP authorization code + PKCE and rotating opaque OAuth tokens.
-- Only SHA-256 digests are persisted; plaintext credentials never enter PostgreSQL.
CREATE TABLE IF NOT EXISTS fs_mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  owner_id text NOT NULL,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fs_mcp_oauth_codes_expires_idx ON fs_mcp_oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS fs_mcp_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_hash text NOT NULL UNIQUE,
  refresh_hash text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  client_id text NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fs_mcp_oauth_tokens_owner_idx ON fs_mcp_oauth_tokens(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS fs_mcp_oauth_tokens_refresh_expiry_idx ON fs_mcp_oauth_tokens(refresh_expires_at);
