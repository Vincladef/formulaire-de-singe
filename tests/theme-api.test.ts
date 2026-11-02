import { describe,it,expect } from 'vitest';
import { createRestHandler } from '../src/server/restApi';
import { defaultFormTheme } from '../src/shared/theme';
import { FormActions } from '../src/server/formActions';
import { UnauthorizedError } from '../src/server/auth';

const ID=crypto.randomUUID();

describe('REST theme authorization and validation',()=>{
 it('refuse toute mutation non authentifiée',async()=>{
  const api=createRestHandler(new FormActions(),async()=>{throw new UnauthorizedError()});
  const res=await api(new Request(`https://example.com/api/forms/${ID}/theme`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(defaultFormTheme)}));
  expect(res.status).toBe(401);
 });
 it('valide les presets côté serveur avant de toucher à Neon',async()=>{
  const api=createRestHandler(new FormActions(),async()=> 'test-owner');
  const res=await api(new Request(`https://example.com/api/forms/${ID}/theme`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...defaultFormTheme,accent:'invalid'})}));
  expect(res.status).toBe(400);
  const data=await res.json();expect(data.error.code).toBe('VALIDATION_ERROR');
 });
});
