import { describe, expect, it } from 'vitest';
import type { FormDetail, FormRepository, FormSummary } from '../src/shared/formApi';
import { FormActions } from '../src/server/formActions';
import { createRestHandler } from '../src/server/restApi';
import { UnauthorizedError } from '../src/server/auth';

const owner = 'person-1';
const viewer = 'person-2';
const formId = '1d3b4fa0-5b4b-4f07-86b9-e7e3339f17a3';
const draftId = 'a2f94923-4e89-4bf5-b77d-11c50e777192';

class FakeRepo implements FormRepository {
  private forms: Array<FormSummary & { ownerId: string }> = [];
  async list(userId: string, limit: number) {
    return this.forms.filter(f => f.ownerId === userId).slice(0, limit);
  }
  async create(userId: string, title: string) {
    this.forms.push({ id: formId, title, slug: 'form-test', role: 'owner', ownerId: userId,
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() });
    return { id: formId, title, slug: 'form-test', draftId };
  }
  async get(userId: string, id: string): Promise<FormDetail | null> {
    const f = this.forms.find(f => f.id === id && f.ownerId === userId);
    return f ? { id: f.id, title: f.title, slug: f.slug, description: null,
      role: 'owner', versions: [{ id: draftId, number: 1, status: 'draft', publishedAt: null, pages: [], rules: [] }] } : null;
  }
  async rename(userId: string, id: string, title: string) {
    const f = this.forms.find(f => f.id === id && f.ownerId === userId);
    if (!f) return null;
    f.title = title;
    return f;
  }
}
const make = () => {
  const repo = new FakeRepo();
  const api = createRestHandler(new FormActions(repo), async (req) => {
    const bearer = req.headers.get('Authorization');
    if (bearer === 'Bearer owner') return owner;
    if (bearer === 'Bearer viewer') return viewer;
    throw new UnauthorizedError();
  });
  const request = (path: string, method = 'GET', token = 'owner', body?: unknown) =>
    api(new Request(`https://formulaire-de-singe.netlify.app${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
  return request;
};

describe('API REST sécurisée', () => {
  it('401 avant tout accès sans identité', async () => {
    const req = make();
    const r = await req('/api/forms', 'GET', 'missing');
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('UNAUTHORIZED');
  });
  it('crée un brouillon et le retrouve sans changer de service', async () => {
    const req = make();
    const created = await req('/api/forms', 'POST', 'owner', { title: '  Enquête UX  ' });
    expect(created.status).toBe(201);
    const data = (await created.json()).data;
    expect(data.id).toBe(formId);
    expect(data.title).toBe('Enquête UX');
    expect(data.draftId).toBe(draftId);
    const detail = await req(`/api/forms/${formId}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data.versions[0].status).toBe('draft');
  });
  it('interdit la lecture et la modification par un autre utilisateur', async () => {
    const req = make();
    await req('/api/forms', 'POST', 'owner', { title: 'Privé' });
    expect((await (await req('/api/forms', 'GET', 'viewer')).json()).data).toEqual([]);
    expect((await req(`/api/forms/${formId}`, 'GET', 'viewer')).status).toBe(404);
    expect((await req(`/api/forms/${formId}`, 'PATCH', 'viewer', { title: 'Piraté' })).status).toBe(404);
    expect((await (await req(`/api/forms/${formId}`)).json()).data.title).toBe('Privé');
  });
  it('modifie le titre uniquement pour le propriétaire', async () => {
    const req = make();
    await req('/api/forms', 'POST', 'owner', { title: 'Initial' });
    expect((await req(`/api/forms/${formId}`, 'PATCH', 'owner', { title: 'Renommé' })).status).toBe(200);
    expect((await (await req(`/api/forms/${formId}`)).json()).data.title).toBe('Renommé');
  });
  it('valide le type et le contenu des requêtes', async () => {
    const req = make();
    expect((await req('/api/forms', 'POST', 'owner', { title: '' })).status).toBe(400);
    expect((await req('/api/forms', 'POST', 'owner', { title: 'Oui', ownerId: 'someone-else' })).status).toBe(400);
    expect((await req('/api/forms?limit=2000')).status).toBe(400);
    expect((await req('/api/forms/abc')).status).toBe(400);
  });
});
