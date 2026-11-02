import type { Config } from '@netlify/functions';
import { cleanupAbandonedAudio } from '../../src/server/audioService';
export default async()=>Response.json(await cleanupAbandonedAudio());
export const config:Config={schedule:'31 3 * * *'};
