import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FormDetail, FormRepository, FormSummary } from '../shared/formApi';
import { getDb } from './db/client';
import {
  forms, formMembers, formVersions, pages, questions, questionOptions, rules,
} from './db/schema';

const iso = (value: Date) => value.toISOString();

/** One owner ID per request, ALWAYS derived from verified auth, never the request body. */
export const formRepository: FormRepository = {
  async list(userId, limit) {
    const db = getDb();
    const rows = await db.select({
      id: forms.id, title: forms.title, slug: forms.slug,
      ownerId: forms.ownerId, memberRole: formMembers.role,
      createdAt: forms.createdAt, updatedAt: forms.updatedAt, archivedAt:forms.archivedAt,
    }).from(forms).leftJoin(formMembers, and(eq(formMembers.formId, forms.id), eq(formMembers.userId, userId)))
      .where(and(isNull(forms.deletedAt), or(eq(forms.ownerId, userId), eq(formMembers.userId, userId))))
      .orderBy(desc(forms.createdAt), asc(forms.id)).limit(limit);
    const publishedVersions=rows.length?await db.select({formId:formVersions.formId}).from(formVersions)
      .where(and(inArray(formVersions.formId, rows.map(r=>r.id)),eq(formVersions.status,'published'))):[];
    const publishedSet=new Set(publishedVersions.map(v=>v.formId));
    return rows.map((r): FormSummary => ({
      id: r.id, title: r.title, slug: r.slug,
      role: r.ownerId === userId ? 'owner' : r.memberRole!,
      createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
      archivedAt:r.archivedAt?iso(r.archivedAt):null, published:publishedSet.has(r.id),
    }));
  },

  async create(userId, title) {
    const db = getDb();
    // Unique suffix is generated in the database; slug never comes from untrusted clients.
    // CTE atomically creates the form AND its initial version, or neither.
    const result = await db.execute(sql`
      WITH f AS (
        INSERT INTO fs_forms (owner_id, title, slug)
        VALUES (${userId}, ${title}, 'form-' || replace(gen_random_uuid()::text, '-', ''))
        RETURNING id, title, slug
      ), v AS (
        INSERT INTO fs_versions (form_id, number, status)
        SELECT id, 1, 'draft' FROM f RETURNING id, form_id
      )
      SELECT f.id, f.title, f.slug, v.id AS draft_id
      FROM f JOIN v ON f.id = v.form_id
    `);
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create initial form version');
    return { id: String(row.id), title: String(row.title), slug: String(row.slug), draftId: String(row.draft_id) };
  },

  async get(userId, id) {
    const db = getDb();
    const [item] = await db.select({
      id: forms.id, title: forms.title, slug: forms.slug, description: forms.description, archivedAt:forms.archivedAt,
      ownerId: forms.ownerId, memberRole: formMembers.role,
    }).from(forms)
      .leftJoin(formMembers, and(eq(formMembers.formId, forms.id), eq(formMembers.userId, userId)))
      .where(and(eq(forms.id, id), isNull(forms.deletedAt),
        or(eq(forms.ownerId, userId), eq(formMembers.userId, userId)))).limit(1);
    if (!item) return null;

    const versions = await db.select().from(formVersions)
      .where(eq(formVersions.formId, id)).orderBy(desc(formVersions.number));
    const versionIds = versions.map(v => v.id);
    const pageRows = versionIds.length ? await db.select().from(pages)
      .where(inArray(pages.versionId, versionIds)).orderBy(asc(pages.position)) : [];
    const pageIds = pageRows.map(p => p.id);
    const questionRows = pageIds.length ? await db.select().from(questions)
      .where(inArray(questions.pageId, pageIds)).orderBy(asc(questions.position)) : [];
    const questionIds = questionRows.map(q => q.id);
    const optionRows = questionIds.length ? await db.select().from(questionOptions)
      .where(inArray(questionOptions.questionId, questionIds)).orderBy(asc(questionOptions.position)) : [];
    const ruleRows = versionIds.length ? await db.select().from(rules)
      .where(inArray(rules.versionId, versionIds)) : [];

    return {
      id: item.id, title: item.title, slug: item.slug, description: item.description, archivedAt:item.archivedAt?iso(item.archivedAt):null,
      role: item.ownerId === userId ? 'owner' : item.memberRole!,
      versions: versions.map((v) => ({
        id: v.id, number: v.number, status: v.status, revision:v.revision, publishedAt: v.publishedAt ? iso(v.publishedAt) : null,
        pages: pageRows.filter(p => p.versionId === v.id).map(p => ({
          id: p.id, position: p.position, title: p.title, description: p.description,
          questions: questionRows.filter(q => q.pageId === p.id).map(q => ({
            id: q.id, position: q.position, type: q.type, label: q.label, description: q.description,
            required: q.required, settings: q.settings,
            options: optionRows.filter(o => o.questionId === q.id).map(o => ({
              id: o.id, position: o.position, value: o.value, label: o.label,
            })),
          })),
        })),
        rules: ruleRows.filter(r => r.versionId === v.id).map(r => ({
          id: r.id, sourceQuestionId: r.sourceQuestionId, targetQuestionId: r.targetQuestionId,
          operator: r.operator, comparison: r.comparison, action: r.action,
        })),
      })),
    } satisfies FormDetail;
  },

  async rename(userId, id, title) {
    const db = getDb();
    // One authorization-guarded UPDATE prevents a TOCTOU race between checking
    // membership and writing. Viewers have no write access.
    const [row] = await db.update(forms).set({ title, updatedAt: sql`now()` })
      .where(and(eq(forms.id, id), isNull(forms.deletedAt),isNull(forms.archivedAt),
        or(eq(forms.ownerId, userId), sql`EXISTS (
          SELECT 1 FROM fs_form_members AS m
          WHERE m.form_id = ${forms.id} AND m.user_id = ${userId} AND m.role = 'editor'
        )`)))
      .returning({ id: forms.id, title: forms.title, slug: forms.slug,
        ownerId: forms.ownerId, createdAt: forms.createdAt, updatedAt: forms.updatedAt });
    if (!row) return null;
    return { id: row.id, title: row.title, slug: row.slug,
      role: row.ownerId === userId ? 'owner' : 'editor',
      createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
  },
};
