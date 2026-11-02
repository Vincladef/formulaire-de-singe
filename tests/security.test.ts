import { describe, expect, it } from 'vitest';
import { canEdit, canRead, resolveAccess } from '../src/server/forms';
import { requireUser, UnauthorizedError } from '../src/server/auth';
import { readFileSync } from 'node:fs';

describe('autorisations applicatives',()=>{
 it('refuse la consultation et écriture sans identité',()=>{
   expect(resolveAccess('user-a','')).toBeNull(); expect(canEdit(null)).toBe(false); expect(canRead(null)).toBe(false);
 });
 it('le propriétaire peut lire et modifier',()=>{
   expect(resolveAccess('user-a','user-a')).toBe('owner');expect(canEdit('owner')).toBe(true);
 });
 it('un spectateur ne peut pas modifier',()=>{
   expect(resolveAccess('user-a','user-b','viewer')).toBe('viewer');expect(canRead('viewer')).toBe(true);expect(canEdit('viewer')).toBe(false);
 });
 it('rejette les requêtes sans jeton',async()=>{
   await expect(requireUser(new Request('https://example.org/api/me'))).rejects.toBeInstanceOf(UnauthorizedError);
 });
});

describe('contraintes de persistance',()=>{
 const migration=readFileSync(new URL('../drizzle/0000_initial.sql',import.meta.url),'utf8');
 it('refuse les changements des versions publiées',()=>{
   expect(migration).toContain('A published version is immutable');
   expect(migration).toContain('Published questionnaire structure is immutable');
 });
 it('interdit les réponses mélangées entre versions',()=>{
   expect(migration).toContain('Answer question/version mismatch');
 });
 it('interdit les soumissions sur brouillons',()=>{
   expect(migration).toContain('Submission requires a published version');
 });
});
