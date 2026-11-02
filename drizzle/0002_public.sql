-- Étape 5 : soumissions publiques atomiques et idempotentes.
-- Pas de suppression de tables ni de modification des données existantes.
ALTER TABLE fs_submissions ADD COLUMN IF NOT EXISTS request_hash char(64);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION fs_submit_public(
  p_slug text, p_version uuid, p_nonce uuid, p_hash text, p_consent boolean, p_answers jsonb
) RETURNS TABLE(submission_id uuid, already_submitted boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_form uuid; v_requires_consent boolean; v_submission uuid;
  answer_item jsonb; v_question record; v_value jsonb; v_count int; v_option_count int;
  v_existing record;
BEGIN
  IF p_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_answers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_answers)>500 THEN
    RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
  END IF;

  SELECT f.id, (COALESCE(f.settings->>'requireConsent','false')='true'
    OR EXISTS(SELECT 1 FROM fs_questions aq JOIN fs_pages ap ON ap.id=aq.page_id WHERE ap.version_id=p_version AND aq.type='audio'))
  INTO v_form,v_requires_consent
  FROM fs_forms f JOIN fs_versions v ON v.form_id=f.id
  WHERE f.slug=p_slug AND f.deleted_at IS NULL AND f.archived_at IS NULL
    AND v.id=p_version AND v.status='published';
  IF v_form IS NULL THEN RAISE EXCEPTION 'VERSION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
  IF v_requires_consent AND p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'CONSENT_REQUIRED' USING ERRCODE='22023';
  END IF;

  -- Before writing anything, validate question membership, values and cardinalities.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_answers) a
             WHERE jsonb_typeof(a) <> 'object' OR a->>'questionId' IS NULL OR a->'value' IS NULL) THEN
    RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_answers)) <> (
       SELECT count(DISTINCT a->>'questionId') FROM jsonb_array_elements(p_answers) a) THEN
    RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
  END IF;

  FOR answer_item IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    SELECT q.id,q.type,q.required INTO v_question
    FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id
    WHERE p.version_id=p_version AND q.id::text=answer_item->>'questionId';
    IF NOT FOUND OR v_question.type IN ('statement','audio') THEN
      RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
    END IF;
    v_value:=answer_item->'value';
    IF v_question.type IN ('short_text','long_text') THEN
      IF jsonb_typeof(v_value)<>'string' OR length(trim(v_value #>> '{}'))=0
        OR (v_question.type='short_text' AND length(v_value #>> '{}') > 500)
        OR (v_question.type='long_text' AND length(v_value #>> '{}') > 10000) THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type IN ('single_choice','select') THEN
      IF jsonb_typeof(v_value)<>'string' OR NOT EXISTS(
          SELECT 1 FROM fs_question_options o WHERE o.question_id=v_question.id AND o.value=v_value #>> '{}') THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type='multiple_choice' THEN
      IF jsonb_typeof(v_value)<>'array' OR jsonb_array_length(v_value)=0
        OR jsonb_array_length(v_value)>100 THEN RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023'; END IF;
      SELECT count(*),count(DISTINCT val) INTO v_count,v_option_count
        FROM jsonb_array_elements_text(v_value) val;
      IF v_count<>v_option_count OR EXISTS(
        SELECT 1 FROM jsonb_array_elements_text(v_value) val
        WHERE NOT EXISTS(SELECT 1 FROM fs_question_options o WHERE o.question_id=v_question.id AND o.value=val)
      ) THEN RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023'; END IF;
    ELSIF v_question.type='number' THEN
      IF jsonb_typeof(v_value)<>'number' OR (v_value #>> '{}')::numeric > 1e100
        OR (v_value #>> '{}')::numeric < -1e100 THEN RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023'; END IF;
    ELSIF v_question.type='date' THEN
      IF jsonb_typeof(v_value)<>'string' OR (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
      BEGIN
        IF to_char((v_value #>> '{}')::date,'YYYY-MM-DD') <> (v_value #>> '{}') THEN
          RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
        END IF;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END;
    ELSE
      RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id
    WHERE p.version_id=p_version AND q.required AND q.type<>'statement'
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE a->>'questionId'=q.id::text)
  ) THEN RAISE EXCEPTION 'MISSING_REQUIRED' USING ERRCODE='22023'; END IF;

  INSERT INTO fs_submissions(version_id,status,client_nonce,submitted_at,request_hash)
  VALUES(p_version,'in_progress',p_nonce,NULL,p_hash)
  ON CONFLICT (client_nonce) DO NOTHING RETURNING id INTO v_submission;

  IF v_submission IS NULL THEN
    SELECT s.id,s.version_id,s.request_hash,s.status INTO v_existing
    FROM fs_submissions s WHERE s.client_nonce=p_nonce;
    IF v_existing.id IS NULL OR v_existing.version_id IS DISTINCT FROM p_version
       OR v_existing.request_hash IS DISTINCT FROM p_hash OR v_existing.status <> 'submitted' THEN
       RAISE EXCEPTION 'NONCE_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.id::uuid,true;
    RETURN;
  END IF;

  INSERT INTO fs_answers(submission_id,question_id,value)
    SELECT v_submission,(a->>'questionId')::uuid,a->'value' FROM jsonb_array_elements(p_answers) a;
  UPDATE fs_submissions SET status='submitted',submitted_at=now() WHERE id=v_submission;
  RETURN QUERY SELECT v_submission,false;
END;
$$;
--> statement-breakpoint
