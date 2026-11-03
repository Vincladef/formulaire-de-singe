import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {sheetsRestHandler} from '../src/server/sheetsRestApi';
import {requireUser} from '../src/server/auth';
import {assertSheetOwner,saveComposioConnection,sheetsConfigured} from '../src/server/sheetsService';
import {activeAccounts,composioConfigured,startComposioGoogle,completeComposioGoogle,createComposioSpreadsheet} from '../src/server/composioService';

vi.mock('../src/server/auth',()=>({requireUser:vi.fn(),UnauthorizedError:class UnauthorizedError extends Error {}}));
vi.mock('../src/server/sheetsService',()=>({
 assertSheetOwner:vi.fn(),saveComposioConnection:vi.fn(),getSheetsStatus:vi.fn(),sheetsConfigured:vi.fn(),
 legacySheetsConfigured:vi.fn(),syncGoogleSheets:vi.fn(),resetFailedSheets:vi.fn(),disconnectSheets:vi.fn(),
 createGoogleSpreadsheet:vi.fn(),exchangeGoogleCode:vi.fn(),saveGoogleConnection:vi.fn(),
}));
vi.mock('../src/server/composioService',()=>({
 activeAccounts:vi.fn(),composioConfigured:vi.fn(),startComposioGoogle:vi.fn(),
 completeComposioGoogle:vi.fn(),createComposioSpreadsheet:vi.fn(),
}));
const formId='5f6c7b8a-1234-4567-8a90-1234567890ab';
const base='https://monk-form.netlify.app/api/integrations/google/';
const call=(route:string,method='GET',cookie?:string)=>sheetsRestHandler(new Request(base+route,{method,
 headers:cookie?{Cookie:cookie}:{Authorization:'Bearer owner'}}));

beforeEach(()=>{
 vi.stubEnv('COMPOSIO_API_KEY','free-hard-capped-project-key');
 vi.mocked(requireUser).mockResolvedValue('owner-1');
 vi.mocked(assertSheetOwner).mockResolvedValue({id:formId,title:'Sondage 20s'});
 vi.mocked(composioConfigured).mockReturnValue(true);
 vi.mocked(sheetsConfigured).mockReturnValue(true);
 vi.mocked(activeAccounts).mockResolvedValue([]);
 vi.mocked(startComposioGoogle).mockResolvedValue('https://connect.composio.dev/link/example');
 vi.mocked(completeComposioGoogle).mockResolvedValue('ca_abcdef');
 vi.mocked(createComposioSpreadsheet).mockResolvedValue('sheet123');
 vi.mocked(saveComposioConnection).mockResolvedValue(undefined);
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('OAuth Google Sheets géré et sécurisé',()=>{
 it('crée un lien Composio sans demander de client OAuth Google',async()=>{
  const res=await call(formId+'/start','POST');
  expect(res.status).toBe(200);
  const json=await res.json();
  expect(json.data.authorizationUrl).toBe('https://connect.composio.dev/link/example');
  expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  expect(startComposioGoogle).toHaveBeenCalledWith('owner-1',base+'composio/verify');
 });
 it('réutilise une connexion active pour un deuxième questionnaire sans autre autorisation',async()=>{
  vi.mocked(activeAccounts).mockResolvedValue([{id:'ca_existing',status:'ACTIVE',user_id:'monk-form:owner-1',toolkit:{slug:'googlesheets'}}]);
  const done=vi.fn();
  const res=await sheetsRestHandler(new Request(base+formId+'/start',{method:'POST'}),done);
  expect((await res.json()).data.connected).toBe(true);
  expect(startComposioGoogle).not.toHaveBeenCalled();
  expect(saveComposioConnection).toHaveBeenCalledWith(formId,'owner-1','sheet123','ca_existing');
  expect(done).toHaveBeenCalledWith(formId);
 });
 it('vérifie identité Neon Auth avant d’activer une connexion Composio',async()=>{
  const res=await call(formId+'/start','POST');
  const stateCookie=res.headers.get('set-cookie')!.split(';')[0];
  const callback=await sheetsRestHandler(new Request(base+'composio/verify?session_uri=sess%3A%2F%2Fsingle-use',{headers:{Cookie:stateCookie}}));
  expect(callback.status).toBe(303);
  expect(callback.headers.get('location')).toContain('/studio?google=verifying');
  const sessionCookie=callback.headers.get('set-cookie')!.split(';')[0];
  const connected=vi.fn();
  const completion=await sheetsRestHandler(new Request(base+'composio/complete',{method:'POST',
   headers:{Cookie:stateCookie+'; '+sessionCookie,Authorization:'Bearer owner'}}),connected);
  expect(completion.status).toBe(200);
  expect((await completion.json()).data.formId).toBe(formId);
  expect(completeComposioGoogle).toHaveBeenCalledWith('owner-1','sess://single-use');
  expect(saveComposioConnection).toHaveBeenCalledWith(formId,'owner-1','sheet123','ca_abcdef');
  expect(connected).toHaveBeenCalledWith(formId);
 });
 it('rejette une personne différente lors du retour OAuth',async()=>{
  const res=await call(formId+'/start','POST');
  const stateCookie=res.headers.get('set-cookie')!.split(';')[0];
  const callback=await sheetsRestHandler(new Request(base+'composio/verify?session_uri=sess',{headers:{Cookie:stateCookie}}));
  const sessionCookie=callback.headers.get('set-cookie')!.split(';')[0];
  vi.mocked(requireUser).mockResolvedValue('attacker-2');
  const completion=await sheetsRestHandler(new Request(base+'composio/complete',{method:'POST',
   headers:{Cookie:stateCookie+'; '+sessionCookie,Authorization:'Bearer other'}}));
  expect(completion.status).toBe(503);
  expect(completeComposioGoogle).not.toHaveBeenCalled();
  expect(saveComposioConnection).not.toHaveBeenCalled();
 });
 it('ne confirme rien si le callback Composio ne fournit aucun session_uri',async()=>{
  const res=await call(formId+'/start','POST');
  const callback=await sheetsRestHandler(new Request(base+'composio/verify',{headers:{Cookie:res.headers.get('set-cookie')!.split(';')[0]}}));
  expect(callback.headers.get('location')).toContain('google=error');
  expect(completeComposioGoogle).not.toHaveBeenCalled();
 });
});
