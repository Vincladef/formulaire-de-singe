import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { forms, formMembers, formVersions, submissions } from './db/schema';

export type FormAccess = 'owner' | 'editor' | 'viewer' | null;
export function resolveAccess(ownerId: string, userId: string, membership?: 'editor' | 'viewer' | null): FormAccess {
  if (!userId) return null;
  if (ownerId === userId) return 'owner';
  return membership ?? null;
}
export function canEdit(access: FormAccess) { return access === 'owner' || access === 'editor'; }
export function canRead(access: FormAccess) { return access !== null; }

export async function getFormAccess(formId: string, userId: string) {
  const db = getDb();
  const [form] = await db.select({ ownerId: forms.ownerId }).from(forms).where(and(eq(forms.id, formId), isNull(forms.deletedAt))).limit(1);
  if (!form) return null;
  if (form.ownerId === userId) return 'owner' as const;
  const [member] = await db.select({ role: formMembers.role }).from(formMembers).where(and(eq(formMembers.formId, formId), eq(formMembers.userId, userId))).limit(1);
  return resolveAccess(form.ownerId, userId, member?.role);
}

export async function createDraftForOwner(userId: string, title: string, slug: string) {
  if (!userId.trim()) throw new Error('Authenticated user required');
  // Neon HTTP transactions are issued via a single parameterized SQL statement.
  // CTE ensures no form without its initial draft is created.
  const db = getDb();
  const result = await db.execute(sql`
    WITH f AS (INSERT INTO fs_forms (owner_id,title,slug) VALUES (${userId},${title},${slug}) RETURNING id, title, slug),
    v AS (INSERT INTO fs_versions (form_id,number,status) SELECT id,1,'draft' FROM f RETURNING id,form_id)
    SELECT f.id, f.title, f.slug, v.id AS draft_id FROM f JOIN v ON v.form_id=f.id
  `);
  return result.rows[0];
}

export async function publishDraft(formId: string, draftId: string, userId: string) {
  if (!canEdit(await getFormAccess(formId, userId))) throw new Error('Forbidden');
  const db = getDb();
  const [published] = await db.update(formVersions).set({ status: 'published', publishedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(formVersions.id,draftId),eq(formVersions.formId,formId),eq(formVersions.status,'draft'))).returning();
  if (!published) throw new Error('Draft not found or already published');
  return published;
}

export async function getSubmissionForOwner(submissionId: string, userId: string) {
  const db = getDb();
  const [row] = await db.select({ id: submissions.id, formId: forms.id }).from(submissions)
    .innerJoin(formVersions,eq(submissions.versionId,formVersions.id)).innerJoin(forms,eq(formVersions.formId,forms.id))
    .where(and(eq(submissions.id,submissionId),isNull(submissions.deletedAt))).limit(1);
  if (!row || !canRead(await getFormAccess(row.formId,userId))) return null;
  return row;
}
