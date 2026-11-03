import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {sheetsRestHandler} from '../src/server/sheetsRestApi';
import {requireUser,UnauthorizedError} from '../src/server/auth';
import {assertSheetOwner,createGoogleSpreadsheet,exchangeGoogleCode,getSheetsStatus,saveGoogleConnection,sheetsConfigured,syncGoogleSheets} from '../src/server/sheetsService';

vi.mock('../src/server/auth',()=>({
 requireUser:vi.fn(),
 UnauthorizedError:class UnauthorizedError extends Error {},
}));
vi.mock('../src/server/sheetsService',()=>({
 assertSheetOwner:vi.fn(),createGoogleSpreadsheet:vi.fn(),exchangeGoogleCode:vi.fn(),
 getSheetsStatus:vi.fn(),saveGoogleConnection:vi.fn(),sheetsConfigured:vi.fn(),
 resetFailedSheets:vi.fn(),disconnectSheets:vi.fn(),syncGoogleSheets:vi.fn(),
}));
const formId='5f6c7b8a-1234-4567-8a90-1234567890ab';
const route='https://monk-form.netlify.app/api/integrations/google/';
const request=(path:string,method='GET',headers?:HeadersInit)=>new Request(route+path,{method,headers});
beforeEach(()=>{
 vi.mocked(requireUser).mockResolvedValue('owner-id');
 vi.mocked(assertSheetOwner).mockResolvedValue({id:formId,title:'Questionnaire de test'});
 vi.mocked(sheetsConfigured).mockReturnValue(true);
 vi.mocked(getSheetsStatus).mockResolvedValue({configured:true,connected:true,spreadsheetUrl:'https://docs.google.com/spreadsheets/d/sheet123/edit',lastSyncedAt:null,lastError:null,pending:0});
 vi.mocked(syncGoogleSheets).mockResolvedValue({claimed:2,done:2,failed:0});
 vi.mocked(exchangeGoogleCode).mockResolvedValue({access:'access',refresh:'refresh'});
 vi.mocked(createGoogleSpreadsheet).mockResolvedValue('sheet123');
 vi.mocked(saveGoogleConnection).mockResolvedValue(undefined);
 vi.stubEnv('GOOGLE_SHEETS_STATE_SECRET','0123456789abcdef0123456789abcdef');
 vi.stubEnv('GOOGLE_SHEETS_CLIENT_ID','client-id');
 vi.stubEnv('GOOGLE_SHEETS_REDIRECT_URI','https://monk-form.netlify.app/api/integrations/google/callback');
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('Google Sheets integration',()=>{
 it('ouvre un OAuth lié au formulaire, puis revient dans son onglet Intégrations',async()=>{
  const start=await sheetsRestHandler(request(formId+'/start','POST'));
  expect(start.status).toBe(200);
  const cookie=start.headers.get('set-cookie');
  expect(cookie).toContain('HttpOnly');
  const authorization=await start.json() as {ok:boolean;data:{authorizationUrl:string}};
  const state=new URL(authorization.data.authorizationUrl).searchParams.get('state');
  expect(state).toBeTruthy();
  const callbackUrl=new URL(route+'callback');
  callbackUrl.searchParams.set('code','oauth-code');
  callbackUrl.searchParams.set('state',state!);
  const after=vi.fn();
  const completed=await sheetsRestHandler(new Request(callbackUrl,{headers:{Cookie:cookie!.split(';')[0]}}),after);
  expect(completed.status).toBe(303);
  const destination=new URL(completed.headers.get('location')!);
  expect(destination.pathname).toBe('/studio');
  expect(destination.searchParams.get('google')).toBe('connected');
  expect(destination.searchParams.get('google_form')).toBe(formId);
  expect(createGoogleSpreadsheet).toHaveBeenCalledWith('access','Questionnaire de test');
  expect(saveGoogleConnection).toHaveBeenCalledWith(formId,'owner-id','sheet123','refresh');
  expect(after).toHaveBeenCalledWith(formId);
 });
 it('ne synchronise manuellement que le formulaire demandé',async()=>{
  const res=await sheetsRestHandler(request(formId+'/sync','POST'));
  expect(res.status).toBe(200);
  expect(syncGoogleSheets).toHaveBeenCalledWith(20,formId);
  expect((await res.json()).data.done).toBe(2);
 });
 it('refuse la synchronisation si le compte Google est déconnecté',async()=>{
  vi.mocked(getSheetsStatus).mockResolvedValue({configured:true,connected:false,spreadsheetUrl:null,lastSyncedAt:null,lastError:null,pending:0});
  const res=await sheetsRestHandler(request(formId+'/sync','POST'));
  expect(res.status).toBe(409);
  expect(syncGoogleSheets).not.toHaveBeenCalled();
 });
 it('refuse un appel sans session Studio',async()=>{
  vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
  const res=await sheetsRestHandler(request(formId+'/sync','POST'));
  expect(res.status).toBe(401);
  expect(syncGoogleSheets).not.toHaveBeenCalled();
 });
});
