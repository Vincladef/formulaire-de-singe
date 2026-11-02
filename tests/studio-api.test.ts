import {describe,it,expect,vi} from 'vitest';
import {UnauthorizedError} from '../src/server/auth';
import {createRestHandler} from '../src/server/restApi';
import {FormActions} from '../src/server/formActions';

const uuid='1d3b4fa0-5b4b-4f07-86b9-e7e3339f17a3';
function make(){
 const actions={list:vi.fn(),create:vi.fn(),get:vi.fn(),rename:vi.fn(),save:vi.fn().mockResolvedValue({revision:2}),
 publish:vi.fn().mockResolvedValue({draftId:uuid}),state:vi.fn().mockResolvedValue({id:uuid}),duplicate:vi.fn().mockResolvedValue({id:uuid})};
 const handler=createRestHandler(actions as unknown as FormActions,async(req)=>{if(req.headers.get('Authorization')!=='Bearer owner')throw new UnauthorizedError();return 'owner-id';});
 const call=(path:string,method:string,authenticated=true,body?:unknown)=>handler(new Request('https://test.local'+path,{method,headers:{...(authenticated?{Authorization:'Bearer owner'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
 return {actions,call};
}
describe('Routes privées Studio',()=>{
 it('refuse toute écriture sans jeton',async()=>{
   const {call,actions}=make();const r=await call(`/api/forms/${uuid}/draft`,'PUT',false,{});
   expect(r.status).toBe(401);expect(actions.save).not.toHaveBeenCalled();
 });
 it('valide avant accès aux services',async()=>{
   const handler=createRestHandler(new FormActions(),async()=> 'owner-id');
   const r=await handler(new Request(`https://test.local/api/forms/${uuid}/draft`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({pages:[]})}));
   expect(r.status).toBe(400);
 });
 it('route les sauvegardes, publications, duplications et états',async()=>{
   const {call,actions}=make();const page={id:crypto.randomUUID(),title:'Début',description:null,questions:[]};
   const body={versionId:crypto.randomUUID(),expectedRevision:1,pages:[page]};
   expect((await call(`/api/forms/${uuid}/draft`,'PUT',true,body)).status).toBe(200);
   expect(actions.save).toHaveBeenCalledWith('owner-id',uuid,body);
   expect((await call(`/api/forms/${uuid}/publish`,'POST',true,{versionId:body.versionId,expectedRevision:2})).status).toBe(200);
   expect((await call(`/api/forms/${uuid}/duplicate`,'POST',true)).status).toBe(201);
   expect((await call(`/api/forms/${uuid}/state`,'POST',true,{action:'archive'})).status).toBe(200);
 });
});
