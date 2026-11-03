import type { Config } from '@netlify/functions';
import { cleanupAbandonedAudio } from '../../src/server/audioService';
export default async()=>Response.json(await cleanupAbandonedAudio());
// Four brief sweeps per day keep abandoned chunks from accumulating after interruptions.
export const config:Config={schedule:'17 */6 * * *'};
