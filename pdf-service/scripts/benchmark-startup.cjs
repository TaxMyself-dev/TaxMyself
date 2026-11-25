// Synthetic local Chromium benchmark: no app, DB, storage, email or signing.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),service=path.join(root,'pdf-service');
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const output=path.resolve(value('--output'));
let createRenderer;
if(args.includes('--baseline')){
  const filename=path.join(service,'src/renderer.cjs'),entry=new Module(filename,module);
  entry.filename=filename;entry.paths=Module._nodeModulePaths(path.dirname(filename));
  entry._compile(fs.readFileSync(value('--baseline'),'utf8'),filename);
  createRenderer=entry.exports.createRenderer;
}else ({createRenderer}=require('../src/renderer.cjs'));
const warmup=args.includes('--warmup');
const png=(()=>{
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,check]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(512);header.writeUInt32BE(512,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc(512*1537);let seed=12345;
  for(let y=0;y<512;y++)for(let x=1;x<1537;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[y*1537+x]=seed>>>24;}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
})();
const records=[];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 for(let repetition=1;repetition<=2;repetition++){
  const stages=[];
  const render=createRenderer({puppeteer:require('puppeteer-core'),template:require('../dist/document-pdf.template.js'),
   executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',fontDirectory:path.join(root,'backend/src/assets/document-fonts'),diagnostics:true,
   logger:line=>{const row=JSON.parse(line);if(row.event==='pdf_render_stages')stages.push(row);}});
  try{
   const startup=performance.now();if(warmup)await render.warmup();
   const warmupMs=Math.round(performance.now()-startup);
   for(const [scenario,rows,logo] of [['short',3,false],['logo',3,true],['allocated-multipage',55,true]]){
    const pairStart=performance.now(),files=[];
    for(const kind of ['original','copy']){
     const requestId=randomUUID(),document={title:'בדיקת PDF 20000',issuerName:'עסק סינתטי',recipientName:'לקוח בדיקה',date:'25-11-2026',documentType:kind==='original'?'מקור':'העתק נאמן למקור',preview:false,
      allocation:rows===55?'מספר הקצאה לבדיקה: 123456789':'',items:Array.from({length:rows},(_,i)=>({'פירוט':'שורת בדיקה '+i,'כמות':'1.00','מחיר':'₪10.00','הנחה':'₪0.00','סה"כ':'₪10.00'})),totals:[{'סה"כ':'₪'+(rows*10)+'.00'}],payments:[],paymentTotals:[],
      ...(logo?{logoDataUri:'data:image/png;base64,'+png.toString('base64')}:{})};
     const start=performance.now(),bytes=await render({version:1,requestId,document});
     if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
     const filename=`${scenario}-${repetition}-${kind}.pdf`;fs.writeFileSync(path.join(output,filename),bytes);
     files.push({kind,filename,bytes:bytes.length,elapsedMs:Math.round(performance.now()-start),stages:stages.find(s=>s.requestId===requestId).stagesMs});
    }
    records.push({scenario,repetition,warmup,warmupMs,pairMs:Math.round(performance.now()-pairStart),files});
   }
  }finally{await render.close();}
 }
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({node:process.version,warmup,records},null,2)+'\n');
 console.log(JSON.stringify({warmup,records:records.map(({files,...r})=>r)}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
