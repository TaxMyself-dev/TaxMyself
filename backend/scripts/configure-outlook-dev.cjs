// Configure only this isolated worktree's DEV Outlook settings; no mailbox tools.
const fs=require('node:fs');const path=require('node:path');
const envPath=path.join(__dirname,'../.env');
const cfg=require('dotenv').parse(fs.readFileSync(envPath));
const args=process.argv.slice(2);
if(args.length>1||args.some(x=>!/^--auth-config-id=ac_[A-Za-z0-9_-]+$/.test(x)))throw Error('Unsupported argument');
const CONFIG_ID=args.length?args[0].slice('--auth-config-id='.length):cfg.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID;
const SLUGS=['OUTLOOK_GET_PROFILE','OUTLOOK_LIST_MESSAGES','OUTLOOK_GET_MESSAGE','OUTLOOK_LIST_OUTLOOK_ATTACHMENTS','OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT'];
const safe=e=>({status:e.status||null,name:e.name||'Error',codes:(()=>{const a=[];for(let c=e;c&&a.length<5;c=c.cause)a.push(c.code||c.status||c.name);return a;})()});
async function main(){
 if(!/^ac_[A-Za-z0-9_-]+$/.test(CONFIG_ID||''))throw Error('REFUSED: valid Outlook auth config ID required');
 if(cfg.DB_DATABASE!=='keepintax-dev'||cfg.COMPOSIO_ENVIRONMENT!=='dev'||!cfg.COMPOSIO_API_KEY)throw Error('REFUSED: DEV config required');
 const {Composio}=require('@composio/core');const sdk=new Composio({apiKey:cfg.COMPOSIO_API_KEY,dangerouslyAllowAutoUploadDownloadFiles:false});
 let config;try{config=await sdk.authConfigs.get(CONFIG_ID);console.log(JSON.stringify({configRead:true,id:config.id,name:config.name,toolkit:config.toolkit.slug,status:config.status,managed:config.isComposioManaged,scheme:config.authScheme,scopes:config.credentials?.scopes}));}
 catch(e){console.log(JSON.stringify({configRead:false,...safe(e)}));}
 if(config&&(config.toolkit.slug!=='outlook'||config.status!=='ENABLED'||!config.isComposioManaged||config.authScheme!=='OAUTH2'))throw Error('REFUSED: supplied Outlook auth config is incompatible');
 const versions=[];
 for(const slug of SLUGS){try{const tool=await sdk.tools.getRawComposioToolBySlug(slug);if(!/^\d{8}_\d+$/.test(tool.version))throw Error('Unpinned version');versions.push(tool.version);console.log(JSON.stringify({definition:slug,version:tool.version,required:tool.inputParameters?.required||[]}));}catch(e){console.log(JSON.stringify({definition:slug,read:false,...safe(e)}));}}
 if(versions.length!==SLUGS.length||new Set(versions).size!==1)throw Error('REFUSED: unable to pin consistent Outlook toolkit');
 const changes={COMPOSIO_OUTLOOK_AUTH_CONFIG_ID:CONFIG_ID,COMPOSIO_OUTLOOK_TOOLKIT_VERSION:versions[0],COMPOSIO_OUTLOOK_CALLBACK_URL:'http://localhost:3002/integrations/outlook/callback',OUTLOOK_FRONTEND_URL:'http://localhost:4202/settings?tab=permissions'};
 let env=fs.readFileSync(envPath,'utf8');
 for(const [key,value]of Object.entries(changes)){const regex=new RegExp('^'+key+'=.*$','m');env=regex.test(env)?env.replace(regex,key+'='+value):env.trimEnd()+'\n'+key+'='+value+'\n';}
 fs.writeFileSync(envPath,env);
 console.log(JSON.stringify({configured:true,database:'keepintax-dev',authConfigVerified:!!config,...changes}));
}
main().catch(e=>{console.error(JSON.stringify({failed:true,...safe(e),safeError:/^REFUSED:/.test(e.message)?e.message:undefined}));process.exitCode=1;});
