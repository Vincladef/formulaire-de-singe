import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const sql=readFileSync(new URL('../drizzle/0000_initial.sql',import.meta.url),'utf8');
for(const table of ['fs_forms','fs_form_members','fs_versions','fs_pages','fs_questions','fs_question_options','fs_rules','fs_submissions','fs_answers','fs_audio_files'])
 assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\b'));
for(const guard of ['fs_versions_lock','fs_pages_lock','fs_questions_lock','fs_options_lock','fs_rules_lock','fs_submission_guard','fs_answer_guard'])
 assert.ok(sql.includes('CREATE TRIGGER '+guard));
console.log('✓ 10 tables + 7 triggers structurants présents');

const studio=readFileSync(new URL('../drizzle/0001_studio.sql',import.meta.url),'utf8');
for(const fn of ['fs_save_draft','fs_publish_and_fork']) assert.match(studio,new RegExp('CREATE OR REPLACE FUNCTION '+fn+'\\('));
for(const field of ['archived_at','revision']) assert.ok(studio.includes(field));
console.log('✓ migration Studio, édition transactionnelle et révisions présentes');
