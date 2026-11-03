import type { Config } from '@netlify/functions';
import { createFoldersHandler } from '../../src/server/folderRestApi';
export default createFoldersHandler();
export const config: Config={
 path:['/api/folders','/api/folders/:id','/api/folders/:id/move'],
 method:['GET','POST','PATCH','DELETE'],
 rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:60},
};
