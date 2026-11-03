import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {authConfigId,startComposioGoogle,completeComposioGoogle,createComposioSpreadsheet,googleSheetsComposioJSON,verifyComposioAccount} from '../src/server/composioService';

const fetchMock=vi.fn();
beforeEach(()=>{vi.stubEnv('COMPOSIO_API_KEY','test-key-never-real');vi.stubEnv('COMPOSIO_OAUTH_VERIFIER_ENABLED','true');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

const result=(data:unknown,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
describe('Composio managed Sheets adapter',()=>{
 it('crée une configuration OAuth gérée et produit un lien autorisé',async()=>{
  fetchMock.mockImplementation(async(url:string)=>{
   if(url.includes('auth_configs?'))return result({items:[]});
   if(url.endsWith('/auth_configs'))return result({auth_config:{id:'ac_abcdef'}},201);
   if(url.endsWith('/connected_accounts/link'))return result({redirect_url:'https://connect.composio.dev/link/ln_example',connected_account_id:'ca_abcdef'},201);
   throw new Error('Unexpected '+url);
  });
  const auth=await authConfigId();expect(auth).toBe('ac_abcdef');
  const linked=await startComposioGoogle('owner-1','https://monk-form.netlify.app/api/integrations/google/composio/verify');
  expect(linked).toEqual({authorizationUrl:'https://connect.composio.dev/link/ln_example',expectedAccountId:'ca_abcdef'});
  const link=fetchMock.mock.calls.find(([url])=>String(url).endsWith('/connected_accounts/link'));
  if(!link)throw new Error('Composio link request absent');
  expect(JSON.parse(link[1].body)).toMatchObject({user_id:'monk-form:owner-1',auth_config_id:'ac_abcdef'});
  for(const [url,init] of fetchMock.mock.calls){
   expect(url).toMatch(/^https:\/\/backend\.composio\.dev\//);
   expect(init.headers['x-api-key']).toBe('test-key-never-real');
  }
 });
 it('refuse une connexion Composio appartenant à un autre utilisateur',async()=>{
  fetchMock.mockResolvedValue(result({id:'ca_abcdef',user_id:'monk-form:another',status:'ACTIVE',toolkit:{slug:'googlesheets'}}));
  await expect(verifyComposioAccount('owner-1','ca_abcdef')).rejects.toThrow(/ne correspond pas/);
 });
 it('vérifie le compte après le callback du fournisseur',async()=>{
  fetchMock.mockImplementation(async(url:string)=>{
   if(url.endsWith('/connected_accounts/ca_abcdef'))return result({id:'ca_abcdef',user_id:'monk-form:owner-1',status:'ACTIVE',toolkit:{slug:'googlesheets'}});
   throw Error('Unexpected URL');
  });
  expect(await completeComposioGoogle('owner-1','ca_abcdef')).toBe('ca_abcdef');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toMatch(/connected_accounts\/ca_abcdef$/);
 });
 it('crée la feuille et ses en-têtes via le proxy Google sans exposer de jeton OAuth',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>{
   const payload=JSON.parse(init.body as string);
   return result({status:200,data:payload.method==='POST'?{spreadsheetId:'sheet-123'}:{}});
  });
  expect(await createComposioSpreadsheet('owner-1','ca_abcdef','Enquête')).toBe('sheet-123');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for(const [,init] of fetchMock.mock.calls){
   const payload=JSON.parse(init.body as string);
   expect(payload.connected_account_id).toBe('ca_abcdef');
   expect(payload.user_id).toBe('monk-form:owner-1');
   expect(payload.endpoint).toMatch(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets/);
   expect(JSON.stringify(payload)).not.toContain('access_token');
  }
 });
 it('distingue un quota fournisseur des autres erreurs',async()=>{
  fetchMock.mockResolvedValue(result({status:429,data:{message:'limit'}}));
  await expect(googleSheetsComposioJSON('owner-1','ca_abcdef','https://sheets.googleapis.com/v4/spreadsheets/sheet-123/values/A1')).rejects.toThrow(/Quota Google/);
 });
});
