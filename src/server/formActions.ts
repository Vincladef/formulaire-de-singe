import { draftPayloadSchema, publishInputSchema, statusActionSchema } from '../shared/studio';
import { duplicateForm, publish, saveDraft, setFormState } from './studioRepository';
import { createFormInput, formParams, listFormsQuery, renameFormInput, type FormRepository } from '../shared/formApi';
import { formRepository } from './formRepository';

export class ValidationFault extends Error { status = 400; code = 'VALIDATION_ERROR' as const; }
export class NotFoundFault extends Error { status = 404; code = 'NOT_FOUND' as const; }

/** Identical use cases for REST handlers and the MCP transport. */
export class FormActions {
  constructor(private readonly repository: FormRepository = formRepository) {}
  list(userId: string, limit: unknown = 20) {
    const parsed = listFormsQuery.safeParse({ limit });
    if (!parsed.success) throw new ValidationFault('Invalid pagination parameters');
    return this.repository.list(userId, parsed.data.limit);
  }
  create(userId: string, input: unknown) {
    const parsed = createFormInput.safeParse(input);
    if (!parsed.success) throw new ValidationFault('Title must contain 1 to 200 characters');
    return this.repository.create(userId, parsed.data.title);
  }
  async get(userId: string, id: unknown) {
    const parsed = formParams.safeParse({ id });
    if (!parsed.success) throw new ValidationFault('Invalid form identifier');
    const result = await this.repository.get(userId, parsed.data.id);
    if (!result) throw new NotFoundFault('Form not found');
    return result;
  }
  async rename(userId: string, id: unknown, input: unknown) {
    const params = formParams.safeParse({ id });
    const body = renameFormInput.safeParse(input);
    if (!params.success || !body.success) throw new ValidationFault('Invalid identifier or title');
    const result = await this.repository.rename(userId, params.data.id, body.data.title);
    if (!result) throw new NotFoundFault('Form not found or modification not permitted');
    return result;
  }
  async save(userId:string,id:unknown,input:unknown){
    const params=formParams.safeParse({id});const body=draftPayloadSchema.safeParse(input);
    if(!params.success||!body.success)throw new ValidationFault('Pages ou identifiant incorrects');
    return saveDraft(userId,params.data.id,body.data);
  }
  async publish(userId:string,id:unknown,input:unknown){
    const params=formParams.safeParse({id});const body=publishInputSchema.safeParse(input);
    if(!params.success||!body.success)throw new ValidationFault('Publication incorrecte');
    return publish(userId,params.data.id,body.data.versionId,body.data.expectedRevision);
  }
  async state(userId:string,id:unknown,input:unknown){
    const params=formParams.safeParse({id});const body=statusActionSchema.safeParse(input);
    if(!params.success||!body.success)throw new ValidationFault('Action incorrecte');
    const result=await setFormState(userId,params.data.id,body.data.action);
    if(!result)throw new NotFoundFault('Formulaire introuvable ou accès interdit');
    return result;
  }
  async duplicate(userId:string,id:unknown){
    const params=formParams.safeParse({id});if(!params.success)throw new ValidationFault('Identifiant incorrect');
    const result=await duplicateForm(userId,params.data.id);
    if(!result)throw new NotFoundFault('Formulaire introuvable');
    return result;
  }

}
