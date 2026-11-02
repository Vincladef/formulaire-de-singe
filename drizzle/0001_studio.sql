-- FORMULAIRE DE SINGE : 0001 Studio. Additive migration, applied after 0000_initial.sql.
ALTER TABLE fs_forms ADD COLUMN IF NOT EXISTS archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE fs_versions ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fs_forms_owner_active_idx ON fs_forms (owner_id, archived_at) WHERE deleted_at IS NULL;
--> statement-breakpoint

-- Single SQL transaction, authorized and revision-checked. All child IDs are stable
-- between saves and discarded only inside the draft; published structures are locked.
CREATE OR REPLACE FUNCTION fs_save_draft(
  p_form uuid,p_user text,p_version uuid,p_revision int,p_pages jsonb
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_revision integer; p jsonb; q jsonb; o jsonb; pi integer; qi integer; oi integer;
BEGIN
  PERFORM 1 FROM fs_forms f WHERE f.id=p_form AND f.deleted_at IS NULL AND f.archived_at IS NULL
    AND (f.owner_id=p_user OR EXISTS (SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=p_user AND m.role='editor'))
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_OR_FORBIDDEN' USING ERRCODE='P0002'; END IF;
  SELECT revision INTO v_revision FROM fs_versions WHERE id=p_version AND form_id=p_form AND status='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_revision<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_pages)<>'array' OR jsonb_array_length(p_pages)<1 OR jsonb_array_length(p_pages)>40 THEN
    RAISE EXCEPTION 'INVALID_PAGES' USING ERRCODE='22023'; END IF;
  DELETE FROM fs_rules WHERE version_id=p_version;
  DELETE FROM fs_question_options WHERE question_id IN (
    SELECT q.id FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id WHERE p.version_id=p_version);
  DELETE FROM fs_questions WHERE page_id IN (SELECT id FROM fs_pages WHERE version_id=p_version);
  DELETE FROM fs_pages WHERE version_id=p_version;
  pi:=0;
  FOR p IN SELECT * FROM jsonb_array_elements(p_pages) LOOP
    INSERT INTO fs_pages(id,version_id,position,title,description)
      VALUES ((p->>'id')::uuid,p_version,pi,p->>'title',p->>'description');
    qi:=0;
    FOR q IN SELECT * FROM jsonb_array_elements(p->'questions') LOOP
      INSERT INTO fs_questions(id,page_id,position,type,label,description,required,settings)
      VALUES ((q->>'id')::uuid,(p->>'id')::uuid,qi,q->>'type',q->>'label',q->>'description',
        (q->>'required')::boolean,COALESCE(q->'settings','{}'::jsonb));
      oi:=0;
      FOR o IN SELECT * FROM jsonb_array_elements(q->'options') LOOP
        INSERT INTO fs_question_options(id,question_id,position,value,label)
        VALUES ((o->>'id')::uuid,(q->>'id')::uuid,oi,o->>'value',o->>'label');
        oi:=oi+1;
      END LOOP;
      qi:=qi+1;
    END LOOP;
    pi:=pi+1;
  END LOOP;
  UPDATE fs_versions SET revision=revision+1,updated_at=now() WHERE id=p_version RETURNING revision INTO v_revision;
  UPDATE fs_forms SET updated_at=now() WHERE id=p_form;
  RETURN v_revision;
END $$;
--> statement-breakpoint

-- Keep every old published version intact. Create the next editable draft
-- and copy its exact pages/questions/options with new IDs in one transaction.
CREATE OR REPLACE FUNCTION fs_publish_and_fork(
 p_form uuid,p_user text,p_version uuid,p_revision integer
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_revision integer; v_new uuid; v_page record; v_question record; v_option record;
 v_page_new uuid; v_question_new uuid; v_next int;
BEGIN
  PERFORM 1 FROM fs_forms f WHERE f.id=p_form AND f.deleted_at IS NULL AND f.archived_at IS NULL
    AND (f.owner_id=p_user OR EXISTS (SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=p_user AND m.role='editor')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_OR_FORBIDDEN' USING ERRCODE='P0002'; END IF;
  SELECT revision INTO v_revision FROM fs_versions WHERE id=p_version AND form_id=p_form AND status='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_revision<>p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fs_pages WHERE version_id=p_version)
    THEN RAISE EXCEPTION 'EMPTY_FORM' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(MAX(number),0)+1 INTO v_next FROM fs_versions WHERE form_id=p_form;
  UPDATE fs_versions SET status='published',published_at=now(),updated_at=now() WHERE id=p_version;
  INSERT INTO fs_versions(form_id,number,status) VALUES(p_form,v_next,'draft') RETURNING id INTO v_new;
  FOR v_page IN SELECT * FROM fs_pages WHERE version_id=p_version ORDER BY position LOOP
    v_page_new:=gen_random_uuid();
    INSERT INTO fs_pages(id,version_id,position,title,description) VALUES
      (v_page_new,v_new,v_page.position,v_page.title,v_page.description);
    FOR v_question IN SELECT * FROM fs_questions WHERE page_id=v_page.id ORDER BY position LOOP
      v_question_new:=gen_random_uuid();
      INSERT INTO fs_questions(id,page_id,position,type,label,description,required,settings) VALUES
      (v_question_new,v_page_new,v_question.position,v_question.type,v_question.label,v_question.description,v_question.required,v_question.settings);
      FOR v_option IN SELECT * FROM fs_question_options WHERE question_id=v_question.id ORDER BY position LOOP
        INSERT INTO fs_question_options(question_id,position,value,label) VALUES
        (v_question_new,v_option.position,v_option.value,v_option.label);
      END LOOP;
    END LOOP;
  END LOOP;
  -- Conditional rules are part of a later stage. Do not silently discard existing ones.
  IF EXISTS (SELECT 1 FROM fs_rules WHERE version_id=p_version) THEN
    RAISE EXCEPTION 'RULES_FORK_NOT_IMPLEMENTED' USING ERRCODE='0A000';
  END IF;
  UPDATE fs_forms SET updated_at=now() WHERE id=p_form;
  RETURN v_new;
END $$;
--> statement-breakpoint
