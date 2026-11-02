import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('formulaire-de-singe'),
  version: z.string(),
  stage: z.literal('foundations'),
  database: z.literal('not-configured'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const formIdSchema = z.string().uuid();

// Les schémas des questionnaires arriveront à l'étape 2/3.
