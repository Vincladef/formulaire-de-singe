CREATE TABLE IF NOT EXISTS fs_audio_transcription_jobs (
 audio_id uuid PRIMARY KEY REFERENCES fs_audio_files(id) ON DELETE CASCADE,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 requested_by text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fs_audio_transcription_jobs_pending_idx
 ON fs_audio_transcription_jobs(status,next_attempt_at,created_at);