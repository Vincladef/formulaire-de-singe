import { healthResponseSchema } from '../../src/shared/contracts';

/** Endpoint public de diagnostic sans accès à Neon ou aux secrets. */
export default async function health(): Promise<Response> {
  const payload = healthResponseSchema.parse({
    status: 'ok',
    service: 'formulaire-de-singe',
    version: '0.1.0',
    stage: 'foundations',
    database: 'not-configured',
  });
  return Response.json(payload, {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
