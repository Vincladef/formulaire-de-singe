-- Organisational folders are private to the owner, not shared with form members.
CREATE TABLE IF NOT EXISTS fs_form_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fs_form_folders_name_not_empty CHECK (length(trim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS fs_form_folders_owner_idx ON fs_form_folders (owner_id, created_at);
ALTER TABLE fs_forms ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES fs_form_folders (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fs_forms_folder_idx ON fs_forms (folder_id);
