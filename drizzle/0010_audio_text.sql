-- Autorise la variante audio avec note écrite facultative, sans compromettre les tickets audio.
-- Participation volontaire sans case automatique ; option Autre avec texte libre validé.
CREATE OR REPLACE FUNCTION fs_submit_public(
  p_slug text, p_version uuid, p_nonce uuid, p_hash text, p_consent boolean, p_answers jsonb
) RETURNS TABLE(submission_id uuid, already_submitted boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_form uuid; v_requires_consent boolean; v_submission uuid;
  answer_item jsonb; v_question record; v_value jsonb; v_count int; v_option_count int;
  v_existing record; v_uploaded uuid;
BEGIN
  IF p_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_answers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_answers)>500 THEN
    RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
  END IF;

  -- Idempotent retry: return the original response even when its audio ticket is now claimed.
  SELECT s.id,s.version_id,s.request_hash,s.status INTO v_existing FROM fs_submissions s WHERE s.client_nonce=p_nonce;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.version_id IS DISTINCT FROM p_version OR v_existing.request_hash IS DISTINCT FROM p_hash OR v_existing.status<>'submitted' THEN
      RAISE EXCEPTION 'NONCE_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.id::uuid,true; RETURN;
  END IF;
  SELECT f.id, (COALESCE(f.settings->>'requireConsent','false')='true'
    OR EXISTS(SELECT 1 FROM fs_questions aq JOIN fs_pages ap ON ap.id=aq.page_id WHERE ap.version_id=p_version AND (aq.type='audio' OR aq.settings->>'answerMode' IN ('audio','either'))))
  INTO v_form,v_requires_consent
  FROM fs_forms f JOIN fs_versions v ON v.form_id=f.id
  WHERE f.slug=p_slug AND f.deleted_at IS NULL AND f.archived_at IS NULL
    AND v.id=p_version AND v.status='published';
  IF v_form IS NULL THEN RAISE EXCEPTION 'VERSION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
  -- Sending the questionnaire is the participation action; no compulsory checkbox.
  -- p_consent is retained for backwards compatibility with existing clients.

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
    SELECT q.id,q.type,q.required,q.settings INTO v_question
    FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id
    WHERE p.version_id=p_version AND q.id::text=answer_item->>'questionId';
    IF NOT FOUND OR v_question.type='statement' THEN
      RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
    END IF;
    v_value:=answer_item->'value';
    IF jsonb_typeof(v_value)='object' AND v_value->>'kind'='audio' THEN
      IF v_question.type<>'audio' AND COALESCE(v_question.settings->>'answerMode','text') NOT IN ('audio','either') THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(v_value->'uploadId')<>'string' OR (v_value->>'uploadId') !~* '^[0-9a-f-]{36}$'
        OR (v_value->>'claimToken') !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
      IF v_value ? 'text' AND (v_question.type <> 'audio' OR
        COALESCE(v_question.settings->>'allowTextSupplement','false') <> 'true' OR
        jsonb_typeof(v_value->'text') <> 'string' OR length(v_value->>'text') > 500) THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM fs_audio_uploads u WHERE u.id=(v_value->>'uploadId')::uuid
           AND u.version_id=p_version AND u.question_id=v_question.id AND u.client_nonce=p_nonce
           AND u.status='verified' AND u.expires_at>now() AND u.actual_bytes=u.declared_bytes
           AND u.claim_hash=encode(digest(v_value->>'claimToken','sha256'),'hex')) THEN
        RAISE EXCEPTION 'AUDIO_UNAVAILABLE' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type='audio' AND COALESCE(v_question.settings->>'allowTextSupplement','false')='true' THEN
      IF jsonb_typeof(v_value)<>'string' OR length(trim(v_value #>> '{}'))=0
        OR length(v_value #>> '{}')>500 THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type IN ('short_text','long_text') AND COALESCE(v_question.settings->>'answerMode','text')<>'audio' THEN
      IF jsonb_typeof(v_value)<>'string' OR length(trim(v_value #>> '{}'))=0
        OR (v_question.type='short_text' AND length(v_value #>> '{}') > 500)
        OR (v_question.type='long_text' AND length(v_value #>> '{}') > 10000) THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type IN ('single_choice','select') THEN
      IF jsonb_typeof(v_value)<>'string' OR NOT EXISTS(
          SELECT 1 FROM fs_question_options o WHERE o.question_id=v_question.id
         AND o.value=CASE WHEN left(v_value #>> '{}',10)='__other__:' THEN '__other__' ELSE v_value #>> '{}' END)
         OR (left(v_value #>> '{}',10)='__other__:' AND
           (length(trim(substr(v_value #>> '{}',11)))=0 OR length(substr(v_value #>> '{}',11))>300)) THEN
        RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023';
      END IF;
    ELSIF v_question.type='multiple_choice' THEN
      IF jsonb_typeof(v_value)<>'array' OR jsonb_array_length(v_value)=0
        OR jsonb_array_length(v_value)>100 THEN RAISE EXCEPTION 'INVALID_ANSWER' USING ERRCODE='22023'; END IF;
      SELECT count(*),count(DISTINCT val) INTO v_count,v_option_count
        FROM jsonb_array_elements_text(v_value) val;
      IF v_count<>v_option_count OR
          (SELECT count(*) FROM jsonb_array_elements_text(v_value) val WHERE left(val,10)='__other__:')>1 OR EXISTS(
        SELECT 1 FROM jsonb_array_elements_text(v_value) val
        WHERE NOT EXISTS(SELECT 1 FROM fs_question_options o WHERE o.question_id=v_question.id
          AND o.value=CASE WHEN left(val,10)='__other__:' THEN '__other__' ELSE val END)
         OR (left(val,10)='__other__:' AND (length(trim(substr(val,11)))=0 OR length(substr(val,11))>300))
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

  -- Never save the claim token in a permanent answer record.
  INSERT INTO fs_answers(submission_id,question_id,value)
    SELECT v_submission,(a->>'questionId')::uuid,
      CASE WHEN a->'value'->>'kind'='audio' THEN
        jsonb_build_object('kind','audio','uploadId',a->'value'->>'uploadId') ||
        CASE WHEN a->'value' ? 'text' THEN jsonb_build_object('text',a->'value'->>'text') ELSE '{}'::jsonb END
      ELSE a->'value' END
    FROM jsonb_array_elements(p_answers) a;

  INSERT INTO fs_audio_files(answer_id,storage_key,content_type,byte_size,duration_ms,status,uploaded_at)
    SELECT a.id,u.storage_key,u.content_type,u.actual_bytes,u.duration_ms,'uploaded',now()
    FROM fs_answers a JOIN fs_audio_uploads u ON (a.value->>'uploadId')::uuid=u.id
    WHERE a.submission_id=v_submission AND a.value->>'kind'='audio';

  UPDATE fs_audio_uploads SET status='claimed',submission_id=v_submission
    WHERE id IN (SELECT (a->'value'->>'uploadId')::uuid FROM jsonb_array_elements(p_answers) a WHERE a->'value'->>'kind'='audio')
    AND client_nonce=p_nonce AND status='verified';
  UPDATE fs_submissions SET status='submitted',submitted_at=now() WHERE id=v_submission;
  RETURN QUERY SELECT v_submission,false;
END;
$$;
--> statement-breakpoint
