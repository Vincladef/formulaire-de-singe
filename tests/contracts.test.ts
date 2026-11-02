import { describe, expect, it } from 'vitest';
import { healthResponseSchema, formIdSchema } from '../src/shared/contracts';

describe('Contrats partagés', () => {
  it('valide la réponse de diagnostic prévue', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', service: 'formulaire-de-singe', version: '0.1.0', stage: 'foundations', database: 'not-configured' }).success).toBe(true);
  });
  it('refuse les identifiants invalides', () => {
    expect(formIdSchema.safeParse('formulaire-123').success).toBe(false);
  });
});
