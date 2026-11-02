-- Étape 7 : transcription manuelle, sans modification des réponses immuables.
ALTER TABLE fs_audio_files ADD COLUMN IF NOT EXISTS transcript text;
--> statement-breakpoint
ALTER TABLE fs_audio_files ADD COLUMN IF NOT EXISTS transcript_source varchar(24);
--> statement-breakpoint
ALTER TABLE fs_audio_files ADD COLUMN IF NOT EXISTS transcript_updated_at timestamptz;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fs_audio_transcript_source_check') THEN
    ALTER TABLE fs_audio_files ADD CONSTRAINT fs_audio_transcript_source_check
      CHECK (transcript_source IS NULL OR transcript_source IN ('whisper','noscribe','other'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fs_submissions_active_date_idx ON fs_submissions (version_id, submitted_at DESC) WHERE deleted_at IS NULL AND status='submitted';
