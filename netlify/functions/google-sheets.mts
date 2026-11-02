import type { Config } from '@netlify/functions';
import { sheetsRestHandler } from '../../src/server/sheetsRestApi';

export default sheetsRestHandler;
export const config:Config={
 path:['/api/integrations/google/callback','/api/integrations/google/:formId','/api/integrations/google/:formId/start','/api/integrations/google/:formId/retry'],
 method:['GET','POST','DELETE'],
};
