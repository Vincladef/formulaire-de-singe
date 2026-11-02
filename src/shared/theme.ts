import { z } from 'zod';

/** Finite, accessible presets. No arbitrary CSS or external font URL is accepted. */
export const formThemeSchema = z.object({
  accent: z.enum(['forest', 'ocean', 'clay', 'plum', 'ink']),
  font: z.enum(['modern', 'editorial', 'soft']),
  background: z.enum(['cream', 'white', 'mist']),
  button: z.enum(['rounded', 'pill', 'square']),
  layout: z.enum(['pages', 'questions']),
}).strict();
export type FormTheme = z.infer<typeof formThemeSchema>;
export const defaultFormTheme: FormTheme = {
  accent: 'forest', font: 'modern', background: 'cream', button: 'rounded', layout: 'pages',
};
export function readFormTheme(value: unknown): FormTheme {
  const parsed = formThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...defaultFormTheme };
}
export const themeOptions = {
  accent: [{value:'forest',label:'Sauge'}, {value:'ocean',label:'Bleu encre'}, {value:'clay',label:'Terre cuite'}, {value:'plum',label:'Prune'}, {value:'ink',label:'Graphite'}],
  font: [{value:'modern',label:'Contemporain'}, {value:'editorial',label:'Éditorial'}, {value:'soft',label:'Doux'}],
  background: [{value:'cream',label:'Ivoire'}, {value:'white',label:'Blanc'}, {value:'mist',label:'Brume'}],
  button: [{value:'rounded',label:'Arrondi'}, {value:'pill',label:'Pilule'}, {value:'square',label:'Discret'}],
  layout: [{value:'pages',label:'Page complète'}, {value:'questions',label:'Une question à la fois'}],
} as const;
