// Resolve DEV return URLs from the same effective ports as the local launchers.
function outlookDevUrls(cfg, ports) {
  const backendPort=Number(ports?.backendPort ?? cfg.PORT ?? 8080);
  if(!Number.isInteger(backendPort)||backendPort<1024||backendPort>65535)throw Error('REFUSED: invalid local backend port');
  const frontend=new URL(cfg.OUTLOOK_FRONTEND_URL||cfg.GMAIL_FRONTEND_URL||'http://localhost:4200/settings?tab=permissions');
  if(!['http:','https:'].includes(frontend.protocol)||!['localhost','127.0.0.1'].includes(frontend.hostname))throw Error('REFUSED: local frontend URL required');
  if(ports){
    if(!Number.isInteger(ports.frontendPort)||ports.frontendPort<1024||ports.frontendPort>65535)throw Error('REFUSED: invalid local frontend port');
    frontend.port=String(ports.frontendPort);
  }
  return {COMPOSIO_OUTLOOK_CALLBACK_URL:`http://localhost:${backendPort}/integrations/outlook/callback`,OUTLOOK_FRONTEND_URL:frontend.toString()};
}
module.exports={outlookDevUrls};
