-- FORMULAIRE DE SINGE : baseline 0000, PostgreSQL 17.
-- Apply on the dedicated projet Neon only. No DROP/TRUNCATE/CASCADE.
CREATE TABLE IF NOT EXISTS fs_forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL,
 title varchar(200) NOT NULL, slug varchar(120) NOT NULL UNIQUE,
 description text, settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 CONSTRAINT fs_forms_title_not_empty CHECK (length(trim(title)) > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_forms_owner_idx ON fs_forms (owner_id, created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_form_members (
 form_id uuid NOT NULL REFERENCES fs_forms(id) ON DELETE RESTRICT,
 user_id text NOT NULL, role varchar(16) NOT NULL CHECK(role IN ('editor','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (form_id, user_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_form_members_user_idx ON fs_form_members (user_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_id uuid NOT NULL REFERENCES fs_forms(id) ON DELETE RESTRICT,
 number integer NOT NULL CHECK (number > 0), status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
 CONSTRAINT fs_version_published_date CHECK ((status='published') = (published_at IS NOT NULL)),
 UNIQUE(form_id, number), UNIQUE(id, form_id)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS fs_single_draft_idx ON fs_versions (form_id) WHERE status='draft';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_version_published_idx ON fs_versions(form_id, published_at DESC) WHERE status='published';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES fs_versions(id) ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position >= 0), title varchar(200) NOT NULL DEFAULT '', description text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(version_id, position), UNIQUE(id, version_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES fs_pages(id) ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position >= 0),
 type varchar(32) NOT NULL CHECK(type IN ('short_text','long_text','single_choice','multiple_choice','select','number','date','audio','statement')),
 label text NOT NULL, description text, required boolean NOT NULL DEFAULT false,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(page_id, position)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_question_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES fs_questions(id) ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position >= 0), value text NOT NULL, label text NOT NULL,
 UNIQUE(question_id, position), UNIQUE(question_id, value)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES fs_versions(id) ON DELETE RESTRICT,
 source_question_id uuid NOT NULL REFERENCES fs_questions(id) ON DELETE RESTRICT,
 target_question_id uuid NOT NULL REFERENCES fs_questions(id) ON DELETE RESTRICT,
 operator varchar(24) NOT NULL CHECK (operator IN ('equals','not_equals','contains','is_empty','not_empty')),
 comparison jsonb, action varchar(16) NOT NULL CHECK (action IN ('show','hide','require')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (source_question_id <> target_question_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_rules_version_idx ON fs_rules (version_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES fs_versions(id) ON DELETE RESTRICT,
 status varchar(16) NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted')),
 client_nonce uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, deleted_at timestamptz,
 CHECK ((status='submitted') = (submitted_at IS NOT NULL))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_submissions_version_idx ON fs_submissions (version_id, created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES fs_submissions(id) ON DELETE RESTRICT,
 question_id uuid NOT NULL REFERENCES fs_questions(id) ON DELETE RESTRICT,
 value jsonb NOT NULL DEFAULT 'null'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(submission_id, question_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_answers_question_idx ON fs_answers (question_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS fs_audio_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), answer_id uuid NOT NULL REFERENCES fs_answers(id) ON DELETE RESTRICT,
 storage_key text NOT NULL UNIQUE, content_type varchar(120) NOT NULL,
 byte_size bigint NOT NULL CHECK(byte_size >= 0), duration_ms integer CHECK(duration_ms >= 0),
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded','removed')),
 created_at timestamptz NOT NULL DEFAULT now(), uploaded_at timestamptz, deleted_at timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fs_audio_answer_idx ON fs_audio_files(answer_id);
--> statement-breakpoint


-- Publication is a one-way transition;
--> statement-breakpoint
 no rewriting an already published version.
CREATE OR REPLACE FUNCTION fs_guard_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Versions cannot be deleted; use controlled form deletion'; END IF;
 IF OLD.status='published' THEN RAISE EXCEPTION 'A published version is immutable'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.form_id IS DISTINCT FROM OLD.form_id OR NEW.number IS DISTINCT FROM OLD.number OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Version identity cannot change'; END IF;
 IF NEW.status='published' THEN
  IF NEW.published_at IS NULL THEN RAISE EXCEPTION 'Publishing requires published_at'; END IF;
 ELSIF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'Draft cannot have published_at'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER fs_versions_lock BEFORE UPDATE OR DELETE ON fs_versions FOR EACH ROW EXECUTE FUNCTION fs_guard_version();
--> statement-breakpoint


CREATE OR REPLACE FUNCTION fs_guard_draft_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_vid uuid; new_vid uuid;
BEGIN
 IF TG_TABLE_NAME='fs_pages' THEN
  IF TG_OP <> 'INSERT' THEN old_vid:=OLD.version_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_vid:=NEW.version_id; END IF;
 ELSIF TG_TABLE_NAME='fs_questions' THEN
  IF TG_OP <> 'INSERT' THEN SELECT version_id INTO old_vid FROM fs_pages WHERE id=OLD.page_id; END IF;
  IF TG_OP <> 'DELETE' THEN SELECT version_id INTO new_vid FROM fs_pages WHERE id=NEW.page_id; END IF;
 ELSIF TG_TABLE_NAME='fs_question_options' THEN
  IF TG_OP <> 'INSERT' THEN SELECT p.version_id INTO old_vid FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE q.id=OLD.question_id; END IF;
  IF TG_OP <> 'DELETE' THEN SELECT p.version_id INTO new_vid FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE q.id=NEW.question_id; END IF;
 ELSE
  IF TG_OP <> 'INSERT' THEN old_vid:=OLD.version_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_vid:=NEW.version_id; END IF;
 END IF;
 IF EXISTS (SELECT 1 FROM fs_versions WHERE id IN (old_vid,new_vid) AND status='published') THEN
  RAISE EXCEPTION 'Published questionnaire structure is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER fs_pages_lock BEFORE INSERT OR UPDATE OR DELETE ON fs_pages FOR EACH ROW EXECUTE FUNCTION fs_guard_draft_children();
--> statement-breakpoint

CREATE TRIGGER fs_questions_lock BEFORE INSERT OR UPDATE OR DELETE ON fs_questions FOR EACH ROW EXECUTE FUNCTION fs_guard_draft_children();
--> statement-breakpoint

CREATE TRIGGER fs_options_lock BEFORE INSERT OR UPDATE OR DELETE ON fs_question_options FOR EACH ROW EXECUTE FUNCTION fs_guard_draft_children();
--> statement-breakpoint

CREATE TRIGGER fs_rules_lock BEFORE INSERT OR UPDATE OR DELETE ON fs_rules FOR EACH ROW EXECUTE FUNCTION fs_guard_draft_children();
--> statement-breakpoint


CREATE OR REPLACE FUNCTION fs_check_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src uuid; tgt uuid;
BEGIN
 SELECT p.version_id INTO src FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE q.id=NEW.source_question_id;
 SELECT p.version_id INTO tgt FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE q.id=NEW.target_question_id;
 IF src IS DISTINCT FROM NEW.version_id OR tgt IS DISTINCT FROM NEW.version_id THEN
   RAISE EXCEPTION 'Rule questions must belong to the same version'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER fs_rule_consistency BEFORE INSERT OR UPDATE ON fs_rules FOR EACH ROW EXECUTE FUNCTION fs_check_rule();
--> statement-breakpoint


CREATE OR REPLACE FUNCTION fs_check_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM fs_versions WHERE id=NEW.version_id AND status='published') THEN
  RAISE EXCEPTION 'Submission requires a published version'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='submitted' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.client_nonce IS DISTINCT FROM OLD.client_nonce) THEN
    RAISE EXCEPTION 'Submitted data cannot be changed'; END IF;
  IF OLD.status='in_progress' AND NEW.version_id IS DISTINCT FROM OLD.version_id THEN RAISE EXCEPTION 'Submission version cannot change'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use controlled retention/purge workflow'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER fs_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON fs_submissions FOR EACH ROW EXECUTE FUNCTION fs_check_submission();
--> statement-breakpoint


CREATE OR REPLACE FUNCTION fs_check_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid; vid uuid; qvid uuid; st text;
BEGIN
 IF TG_OP <> 'INSERT' THEN sid:=OLD.submission_id;
 ELSE sid:=NEW.submission_id; END IF;
 SELECT version_id, status INTO vid, st FROM fs_submissions WHERE id=sid;
 IF st='submitted' THEN RAISE EXCEPTION 'Submitted answers are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT p.version_id INTO qvid FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE q.id=NEW.question_id;
 IF vid IS DISTINCT FROM qvid THEN RAISE EXCEPTION 'Answer question/version mismatch'; END IF;
 IF TG_OP='UPDATE' AND NEW.submission_id IS DISTINCT FROM OLD.submission_id THEN RAISE EXCEPTION 'Cannot move an answer between submissions'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER fs_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON fs_answers FOR EACH ROW EXECUTE FUNCTION fs_check_answer();
--> statement-breakpoint

