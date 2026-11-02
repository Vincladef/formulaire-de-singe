import { z } from 'zod';

export const uuidSchema = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Date invalide');
export const resultsFilterSchema = z.object({
  from: isoDate.optional(), to: isoDate.optional(), versionId: uuidSchema.optional(),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).refine(v => !v.from || !v.to || v.from <= v.to, 'Période invalide');
export type ResultsFilter = z.infer<typeof resultsFilterSchema>;
export const transcriptInputSchema = z.object({
  text: z.string().trim().min(1).max(100000),
  source: z.enum(['whisper', 'noscribe', 'other']),
}).strict();
export const deletionInputSchema = z.object({ confirmation: z.literal('SUPPRIMER') }).strict();

export type ResultsVersion = { id: string; number: number; publishedAt: string | null };
export type ResultsQuestion = { id: string; versionId: string; label: string; type: string; position: number; options: { value: string; label: string }[]; responses: number; choices: { value: string; label: string; count: number }[] };
export type ResultsSubmission = { id: string; versionId: string; versionNumber: number; submittedAt: string };
export type ResultsOverview = { formId: string; title: string; total: number; versions: ResultsVersion[]; questions: ResultsQuestion[]; submissions: ResultsSubmission[]; limit: number; offset: number; hasMore: boolean; completionRate: null };
export type ResultAnswer = { id: string; questionId: string; label: string; type: string; position: number; value: unknown; audio: null | { id: string; mimeType: string; durationMs: number | null; bytes: number; transcript: string | null; transcriptSource: string | null } };
export type SubmissionDetail = ResultsSubmission & { answers: ResultAnswer[] };

export function safeCsvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  // CSV formula injection is possible when users open a file in Excel or LibreOffice.
  const sanitized = /^[\s\u0000-\u001f]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${sanitized.replaceAll('"', '""')}"`;
}
export function csvOfSubmissions(rows: SubmissionDetail[]): string {
  const questionIds = [...new Set(rows.flatMap(r => r.answers.map(a => a.questionId)))];
  const header = ['submission_id', 'version_id', 'version_number', 'submitted_at', ...questionIds.flatMap(id => [`${id}:answer`, `${id}:audio_id`, `${id}:transcript`])];
  const lines = rows.map(row => {
    const answers = new Map(row.answers.map(a => [a.questionId, a]));
    return [row.id, row.versionId, row.versionNumber, row.submittedAt, ...questionIds.flatMap(id => {
      const a = answers.get(id);
      return [a?.audio ? '[audio]' : a?.value ?? '', a?.audio?.id ?? '', a?.audio?.transcript ?? ''];
    })].map(safeCsvCell).join(',');
  });
  return '\uFEFF' + [header.map(safeCsvCell).join(','), ...lines].join('\r\n');
}
export function exportJson(rows: SubmissionDetail[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), submissions: rows }, null, 2);
}
