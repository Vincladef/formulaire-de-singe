import { z } from 'zod';

/** Strict schemas shared by the REST API and MCP tools. */
export const createFormInput = z.object({
  title: z.string().trim().min(1).max(200),
}).strict();
export const renameFormInput = createFormInput;
export const listFormsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const formParams = z.object({ id: z.string().uuid() }).strict();

export const formSummary = z.object({
  id: z.string().uuid(), title: z.string(), slug: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']),
  createdAt: z.string(), updatedAt: z.string(), archivedAt:z.string().nullable().optional(), published:z.boolean().optional(),
});
export const apiErrorCode = z.enum([
  'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'METHOD_NOT_ALLOWED',
  'VALIDATION_ERROR', 'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR', 'CONFLICT',
]);
export const apiError = z.object({
  ok: z.literal(false), error: z.object({ code: apiErrorCode, message: z.string() }),
});
export const createFormResponse = z.object({ ok: z.literal(true), data: z.object({
  id: z.string().uuid(), title: z.string(), slug: z.string(), draftId: z.string().uuid(),
}) });
export type FormSummary = z.infer<typeof formSummary>;
export type FormCreate = z.infer<typeof createFormInput>;

/** Content is intentionally JSON-compatible and version-specific. */
export type FormDetail = {
  id: string; title: string; slug: string; description: string | null; archivedAt?:string|null;
  role: 'owner' | 'editor' | 'viewer';
  versions: Array<{
    id: string; number: number; status: 'draft' | 'published'; publishedAt: string | null; revision?:number;
    pages: Array<{
      id: string; position: number; title: string; description: string | null;
      questions: Array<{
        id: string; position: number; type: string; label: string;
        description: string | null; required: boolean;
        settings: Record<string, unknown>;
        options: Array<{ id: string; position: number; value: string; label: string }>;
      }>;
    }>;
    rules: Array<{ id: string; sourceQuestionId: string; targetQuestionId: string;
      operator: string; comparison: unknown; action: string }>;
  }>;
};

export interface FormRepository {
  list(userId: string, limit: number): Promise<FormSummary[]>;
  create(userId: string, title: string): Promise<{ id: string; title: string; slug: string; draftId: string }>;
  get(userId: string, id: string): Promise<FormDetail | null>;
  rename(userId: string, id: string, title: string): Promise<FormSummary | null>;
}
