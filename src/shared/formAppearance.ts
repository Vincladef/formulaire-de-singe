import { z } from 'zod';

/** Theme options are intentionally bounded. No arbitrary CSS or script injection. */
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/,'Couleur hexadécimale #RRGGBB attendue');
export const formAppearanceSchema=z.object({
 accent:color.optional().describe('Buttons and progress indicators'),
 background:color.optional().describe('Questionnaire outer background'),
 surface:color.optional().describe('Question cards background'),
 text:color.optional().describe('Main text and headings'),
 font:z.enum(['sans','serif','system']).optional(),
 thankYouTitle:z.string().trim().min(1).max(160).optional(),
 thankYouMessage:z.string().trim().min(1).max(1000).optional(),
}).strict();
export type FormAppearance=z.infer<typeof formAppearanceSchema>;

export function readFormAppearance(settings:unknown):FormAppearance{
 const source=settings&&typeof settings==='object'&&!Array.isArray(settings)
  ?(settings as Record<string,unknown>).appearance:{};
 const result=formAppearanceSchema.safeParse(source);
 return result.success?result.data:{};
}
