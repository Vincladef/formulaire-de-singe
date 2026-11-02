-- Augmenter la durée autorisée sans modifier les données ni le plafond de 15 Mio par fichier.
-- La durée par défaut est de 10 min, configurable jusqu'à 30 min.
ALTER TABLE fs_audio_uploads
  DROP CONSTRAINT IF EXISTS fs_audio_uploads_duration_ms_check;
--> statement-breakpoint
ALTER TABLE fs_audio_uploads
  ADD CONSTRAINT fs_audio_uploads_duration_ms_check
  CHECK (duration_ms > 0 AND duration_ms <= 1800000);
