import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, varchar, bigint } from 'drizzle-orm/pg-core';

const timestamps = { createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() };
export const folders = pgTable('fs_form_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('fs_form_folders_owner_idx').on(t.ownerId, t.createdAt), index('fs_form_folders_parent_idx').on(t.parentId), check('fs_form_folders_name_not_empty', sql`length(trim(${t.name})) > 0`)]);

export const forms = pgTable('fs_forms', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull(), title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(), description: text('description'),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}), ...timestamps,
  deletedAt: timestamp('deleted_at', { withTimezone: true }), archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [index('fs_forms_owner_idx').on(t.ownerId, t.createdAt), index('fs_forms_folder_idx').on(t.folderId), check('fs_forms_title_not_empty', sql`length(trim(${t.title})) > 0`)]);

export const formMembers = pgTable('fs_form_members', {
  formId: uuid('form_id').notNull().references(() => forms.id, { onDelete: 'restrict' }), userId: text('user_id').notNull(),
  role: varchar('role', { length: 16 }).$type<'editor' | 'viewer'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.formId, t.userId] }), index('fs_form_members_user_idx').on(t.userId), check('fs_form_members_role_check', sql`${t.role} in ('editor', 'viewer')`)]);

export const formVersions = pgTable('fs_versions', {
  id: uuid('id').primaryKey().defaultRandom(), formId: uuid('form_id').notNull().references(() => forms.id, { onDelete: 'restrict' }),
  number: integer('number').notNull(), status: varchar('status', { length: 16 }).$type<'draft' | 'published'>().notNull().default('draft'),
  ...timestamps, publishedAt: timestamp('published_at', { withTimezone: true }), revision: integer('revision').notNull().default(0),
}, (t) => [unique('fs_versions_form_id_number_unique').on(t.formId, t.number), unique('fs_versions_id_form_id_unique').on(t.id, t.formId),
  uniqueIndex('fs_single_draft_idx').on(t.formId).where(sql`${t.status} = 'draft'`),
  index('fs_version_published_idx').on(t.formId, t.publishedAt).where(sql`${t.status} = 'published'`),
  check('fs_versions_number_check', sql`${t.number} > 0`), check('fs_versions_status_check', sql`${t.status} in ('draft', 'published')`),
  check('fs_version_published_date', sql`(${t.status} = 'published') = (${t.publishedAt} is not null)`)]);

export const pages = pgTable('fs_pages', {
  id: uuid('id').primaryKey().defaultRandom(), versionId: uuid('version_id').notNull().references(() => formVersions.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(), title: varchar('title', { length: 200 }).notNull().default(''), description: text('description'), ...timestamps,
}, t => [unique('fs_pages_version_id_position_unique').on(t.versionId, t.position), unique('fs_pages_id_version_id_unique').on(t.id, t.versionId), check('fs_pages_position_check', sql`${t.position} >= 0`)]);

export const questions = pgTable('fs_questions', {
  id: uuid('id').primaryKey().defaultRandom(), pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'restrict' }), position: integer('position').notNull(),
  type: varchar('type', { length: 32 }).$type<'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'select' | 'number' | 'date' | 'audio' | 'statement'>().notNull(),
  label: text('label').notNull(), description: text('description'), required: boolean('required').notNull().default(false),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}), ...timestamps,
}, t => [unique('fs_questions_page_id_position_unique').on(t.pageId, t.position),check('fs_questions_position_check', sql`${t.position} >= 0`),
  check('fs_questions_type_check', sql`${t.type} in ('short_text','long_text','single_choice','multiple_choice','select','number','date','audio','statement')`)]);

export const questionOptions = pgTable('fs_question_options', {
  id: uuid('id').primaryKey().defaultRandom(), questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(), value: text('value').notNull(), label: text('label').notNull(),
}, t => [unique('fs_question_options_question_id_position_unique').on(t.questionId,t.position), unique('fs_question_options_question_id_value_unique').on(t.questionId,t.value), check('fs_question_options_position_check',sql`${t.position} >= 0`)]);

export const rules = pgTable('fs_rules', {
  id: uuid('id').primaryKey().defaultRandom(), versionId: uuid('version_id').notNull().references(() => formVersions.id, { onDelete: 'restrict' }),
  sourceQuestionId: uuid('source_question_id').notNull().references(() => questions.id, { onDelete: 'restrict' }),
  targetQuestionId: uuid('target_question_id').notNull().references(() => questions.id, { onDelete: 'restrict' }),
  operator: varchar('operator',{length:24}).$type<'equals'|'not_equals'|'contains'|'is_empty'|'not_empty'>().notNull(),
  comparison: jsonb('comparison'), action: varchar('action',{length:16}).$type<'show'|'hide'|'require'>().notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, t => [index('fs_rules_version_idx').on(t.versionId), check('fs_rules_distinct_questions',sql`${t.sourceQuestionId} <> ${t.targetQuestionId}`),
  check('fs_rules_operator_check',sql`${t.operator} in ('equals','not_equals','contains','is_empty','not_empty')`),
  check('fs_rules_action_check',sql`${t.action} in ('show','hide','require')`)]);

export const submissions = pgTable('fs_submissions', {
  id: uuid('id').primaryKey().defaultRandom(), versionId: uuid('version_id').notNull().references(() => formVersions.id, { onDelete: 'restrict' }),
  status: varchar('status',{length:16}).$type<'in_progress'|'submitted'>().notNull().default('in_progress'),
  clientNonce: uuid('client_nonce').unique(), requestHash: varchar('request_hash', { length: 64 }), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  submittedAt: timestamp('submitted_at',{withTimezone:true}), deletedAt: timestamp('deleted_at',{withTimezone:true}),
},t=>[index('fs_submissions_version_idx').on(t.versionId,t.createdAt),check('fs_submissions_status_check',sql`${t.status} in ('in_progress','submitted')`),
  check('fs_submissions_submitted_check',sql`(${t.status} = 'submitted') = (${t.submittedAt} is not null)`)]);

export const answers = pgTable('fs_answers',{
 id: uuid('id').primaryKey().defaultRandom(), submissionId: uuid('submission_id').notNull().references(()=>submissions.id,{onDelete:'restrict'}),
 questionId: uuid('question_id').notNull().references(()=>questions.id,{onDelete:'restrict'}),
 value: jsonb('value').$type<unknown>().notNull().default(sql`'null'::jsonb`),...timestamps,
},t=>[unique('fs_answers_submission_id_question_id_unique').on(t.submissionId,t.questionId),index('fs_answers_question_idx').on(t.questionId)]);

export const audioUploads = pgTable('fs_audio_uploads',{
 id:uuid('id').primaryKey().defaultRandom(),
 formId:uuid('form_id').notNull().references(()=>forms.id,{onDelete:'restrict'}),
 versionId:uuid('version_id').notNull().references(()=>formVersions.id,{onDelete:'restrict'}),
 questionId:uuid('question_id').notNull().references(()=>questions.id,{onDelete:'restrict'}),
 submissionId:uuid('submission_id').references(()=>submissions.id,{onDelete:'restrict'}),
 clientNonce:uuid('client_nonce').notNull(),claimHash:varchar('claim_hash',{length:64}).notNull(),
 storageKey:text('storage_key').notNull().unique(),contentType:varchar('content_type',{length:120}).notNull(),
 declaredBytes:bigint('declared_bytes',{mode:'number'}).notNull(),actualBytes:bigint('actual_bytes',{mode:'number'}),
 durationMs:integer('duration_ms').notNull(),status:varchar('status',{length:16}).$type<'issued'|'verified'|'claimed'|'expired'>().notNull().default('issued'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
 verifiedAt:timestamp('verified_at',{withTimezone:true}),
},t=>[index('fs_audio_uploads_nonce_idx').on(t.clientNonce,t.status),index('fs_audio_uploads_cleanup_idx').on(t.expiresAt,t.status)]);

export const audioFiles = pgTable('fs_audio_files',{
 id: uuid('id').primaryKey().defaultRandom(), answerId: uuid('answer_id').notNull().references(()=>answers.id,{onDelete:'restrict'}),
 storageKey: text('storage_key').notNull().unique(), contentType: varchar('content_type',{length:120}).notNull(),
 byteSize: bigint('byte_size',{mode:'number'}).notNull(), durationMs: integer('duration_ms'),
 status: varchar('status',{length:16}).$type<'pending'|'uploaded'|'removed'>().notNull().default('pending'),
 createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 uploadedAt: timestamp('uploaded_at',{withTimezone:true}),deletedAt: timestamp('deleted_at',{withTimezone:true}),
},t=>[index('fs_audio_answer_idx').on(t.answerId),check('fs_audio_byte_size_check',sql`${t.byteSize} >= 0`),check('fs_audio_duration_check',sql`${t.durationMs} >= 0`),check('fs_audio_status_check',sql`${t.status} in ('pending','uploaded','removed')`)]);
