import { z } from 'zod';
import { questionTypes, type QuestionType } from './studio';

export const publicAnswerSchema = z.object({
  questionId: z.string().uuid(),
  value: z.union([z.string().max(10000), z.number().finite(), z.array(z.string().max(300)).max(100)]),
}).strict();
export const publicSubmitSchema = z.object({
  versionId: z.string().uuid(),
  clientNonce: z.string().uuid(),
  consent: z.boolean().default(false),
  website: z.string().max(200).default(''), // honeypot
  answers: z.array(publicAnswerSchema).max(500),
}).strict();
export type PublicSubmissionInput = z.infer<typeof publicSubmitSchema>;
export type PublicAnswer = z.infer<typeof publicAnswerSchema>;
export type PublicQuestion = {
  id: string; type: QuestionType; label: string; description: string | null; required: boolean;
  options: Array<{value:string;label:string}>;
};
export type PublicPage = { id: string; title:string; description:string|null; questions:PublicQuestion[] };
export type PublicForm = {
  id: string; title:string; description:string|null; slug:string;
  versionId:string; versionNumber:number; requireConsent:boolean;
  pages:PublicPage[];
};
export type AnswerValues = Record<string, string | number | string[] | undefined>;

export function isAnswered(value: AnswerValues[string]): boolean {
  return typeof value === 'string' ? value.trim().length > 0
    : typeof value === 'number' ? Number.isFinite(value)
    : Array.isArray(value) ? value.length > 0 : false;
}
export function validateAnswers(form: PublicForm, values: AnswerValues): Record<string,string> {
  const errors: Record<string,string> = {};
  for (const page of form.pages) for (const q of page.questions) {
    if (q.type === 'statement') continue;
    const value=values[q.id];
    if (!isAnswered(value)) {
      if (q.required) errors[q.id] = 'Cette réponse est obligatoire.';
      continue;
    }
    if (q.type==='audio') { errors[q.id]='L’enregistrement vocal sera bientôt disponible. Cette question ne peut pas encore recevoir de réponse.';continue; }
    if (q.type==='short_text' || q.type==='long_text') {
      if(typeof value!=='string') errors[q.id]='Saisissez un texte.';
      else if(value.length>(q.type==='short_text'?500:10000)) errors[q.id]='Votre réponse est trop longue.';
    } else if (q.type==='number') {
      if (typeof value!=='number'||!Number.isFinite(value)) errors[q.id]='Indiquez un nombre valide.';
    } else if (q.type==='date') {
      if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) errors[q.id]='Indiquez une date valide.';
    } else if (q.type==='single_choice'||q.type==='select') {
      if(typeof value!=='string'||!q.options.some(o=>o.value===value)) errors[q.id]='Sélectionnez une option proposée.';
    } else if (q.type==='multiple_choice') {
      if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(v=>!q.options.some(o=>o.value===v))) errors[q.id]='Choisissez uniquement parmi les options proposées.';
    }
  }
  return errors;
}
export function toSubmissionAnswers(form:PublicForm,values:AnswerValues):PublicAnswer[]{
  return form.pages.flatMap(p=>p.questions.filter(q=>q.type!=='statement'&&q.type!=='audio'&&isAnswered(values[q.id]))
    .map(q=>({questionId:q.id,value:values[q.id]! as string|number|string[]})));
}
export function getQuestionType(type:string):QuestionType {
  const result=questionTypes.find(t=>t===type);
  if(!result) throw new Error('Type de question non reconnu');
  return result;
}
