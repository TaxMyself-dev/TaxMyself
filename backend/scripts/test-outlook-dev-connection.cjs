// Isolated DEV identity-only OAuth test: no AppModule, scheduler or mailbox reads.
require('reflect-metadata');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {randomUUID}=require('node:crypto');const {DataSource}=require('typeorm');
const cfg=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env')));
async function main(){
 if(cfg.DB_DATABASE!=='keepintax-dev'||cfg.COMPOSIO_ENVIRONMENT!=='dev'||cfg.DISABLE_SYNCHRONIZE!=='true'||!cfg.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID||!/^\d{8}_\d+$/.test(cfg.COMPOSIO_OUTLOOK_TOOLKIT_VERSION||''))throw Error('REFUSED: configured DEV required');
 if(process.argv.length>2)throw Error('REFUSED: no arguments supported');
 Object.assign(process.env,cfg,{NODE_ENV:'development',DISABLE_SYNCHRONIZE:'true',SKIP_BOOT_SEED:'true',COMPOSIO_OUTLOOK_CALLBACK_URL:'http://127.0.0.1:4318/integrations/outlook/callback'});
 const {UserIntegration}=require('../dist/integrations/entities/user-integration.entity');const {OauthState}=require('../dist/integrations/entities/oauth-state.entity');
 const {ComposioClientService}=require('../dist/integrations/services/composio-client.service');const {EmailConnectionsService}=require('../dist/integrations/services/email-connections.service');const {OauthStateService}=require('../dist/integrations/services/oauth-state.service');const {UserIntegrationsService}=require('../dist/integrations/services/user-integrations.service');
 require('@nestjs/common').Logger.overrideLogger(false);
 const composio=new ComposioClientService();const sdk=composio.client();const execute=sdk.tools.execute.bind(sdk.tools);let identityExecutions=0;
 sdk.tools.execute=async(slug,...args)=>{if(slug!=='OUTLOOK_GET_PROFILE')throw Error('REFUSED: identity-only test');identityExecutions++;return execute(slug,...args);};
 sdk.connectedAccounts.delete=async()=>{throw Error('REFUSED: test cannot remove connections');};
 const db=new DataSource({type:'mysql',host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),username:cfg.DB_USERNAME,password:cfg.DB_PASSWORD,database:'keepintax-dev',entities:[UserIntegration,OauthState],synchronize:false,migrationsRun:false,logging:false,connectTimeout:10000});
 await db.initialize();const [identity]=await db.query('SELECT DATABASE() AS db');if(identity.db!=='keepintax-dev'){await db.destroy();throw Error('REFUSED: wrong runtime database');}
 const owner='composio-dev-outlook-test-'+randomUUID();const integrations=new UserIntegrationsService(db.getRepository(UserIntegration));const service=new EmailConnectionsService(composio,new OauthStateService(db.getRepository(OauthState)),integrations);
 let status='pending',busy=false,timer;
 const close=async()=>{clearTimeout(timer);server.close();if(db.isInitialized)await db.destroy();};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  const url=new URL(req.url,'http://127.0.0.1:4318');
  if(req.method==='GET'&&url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status,identityExecutions,messageToolsExecuted:0}));return;}
  if(req.method!=='GET'||url.pathname!=='/integrations/outlook/callback'||status!=='pending'||busy){res.writeHead(404);res.end('Not found');return;}
  busy=true;
  try{
   await service.complete(url.searchParams.get('state')||'',url.searchParams.get('connected_account_id')||'',url.searchParams.get('error')?'failed':url.searchParams.get('status')||'','MICROSOFT');
   const rows=await integrations.findAllByUserAndProvider(owner,'MICROSOFT');
   if(rows.length!==1||rows[0].status!=='ACTIVE'||rows[0].refreshToken||rows[0].accessToken||rows[0].initialImportCompletedAt)throw Error('REFUSED: saved connection verification failed');
   status='connected';console.log(JSON.stringify({status,database:'keepintax-dev',integrationId:rows[0].id,mailboxIdentityVerified:true,tokensStoredLocally:false,identityExecutions,messageToolsExecuted:0,initialImportStarted:false}));
   res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('DEV Outlook identity verified. No messages read or imported. You can close this tab.');
  }catch(e){status='failed';console.error(JSON.stringify({status,safeError:e.category||e.code||e.name,identityExecutions,messageToolsExecuted:0}));res.writeHead(400,{'Content-Type':'text/plain'});res.end('DEV Outlook connection could not be verified. Return to Codex.');}
  finally{busy=false;}
 });
 process.once('SIGINT',()=>close().finally(()=>process.exit(0)));process.once('SIGTERM',()=>close().finally(()=>process.exit(0)));
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4318,'127.0.0.1',resolve);});
  timer=setTimeout(()=>{console.log(JSON.stringify({status:'diagnostic-expired',identityExecutions,messageToolsExecuted:0}));close();},10*60*1000);
  const result=await service.connect(owner,undefined,'MICROSOFT');
  console.log(JSON.stringify({status:'awaiting-user-consent',redirectUrl:result.url,technicalDevUser:true,toolkitVersion:cfg.COMPOSIO_OUTLOOK_TOOLKIT_VERSION,callback:'http://127.0.0.1:4318/integrations/outlook/callback',schedulerStarted:false,messageToolsAllowed:false}));
 }catch(e){await close();throw e;}
}
main().catch(e=>{console.error(JSON.stringify({failed:true,status:e.status||null,safeError:e.category||e.code||e.name||'Error'}));process.exitCode=1;});
