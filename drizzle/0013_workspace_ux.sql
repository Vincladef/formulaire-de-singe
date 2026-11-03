-- Hierarchical private folders, preserving form assignments when a parent is removed.
ALTER TABLE fs_form_folders
 ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES fs_form_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fs_form_folders_parent_idx ON fs_form_folders(parent_id);
-- Explicit user-requested retranscription, without deleting the existing text on failure.
ALTER TABLE fs_audio_transcription_jobs
 ADD COLUMN IF NOT EXISTS force boolean NOT NULL DEFAULT false;
