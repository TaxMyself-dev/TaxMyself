// DEV-only Outlook schema application. Does not boot Nest or contact any provider.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const SQL = 'ALTER TABLE email_import_items\n  MODIFY COLUMN message_id VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL';

async function inspect(db) {
  const [[identity]] = await db.query('SELECT DATABASE() AS db, VERSION() AS version');
  if (identity.db !== 'keepintax-dev') throw Error('REFUSED: runtime database mismatch');
  const [[table]] = await db.query("SELECT ENGINE, ROW_FORMAT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_items'");
  if (!table || table.ENGINE !== 'InnoDB' || !['Dynamic','Compressed'].includes(table.ROW_FORMAT)) throw Error('REFUSED: incompatible table or row format');
  const [columns] = await db.query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, CHARACTER_OCTET_LENGTH, CHARACTER_SET_NAME, COLLATION_NAME, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_items' AND COLUMN_NAME IN ('run_id','message_id','part_path')");
  const message = columns.find(x=>x.COLUMN_NAME==='message_id');
  if (columns.length!==3 || !message || message.DATA_TYPE!=='varchar' || message.IS_NULLABLE!=='NO' || ![128,512].includes(Number(message.CHARACTER_MAXIMUM_LENGTH))) throw Error('REFUSED: unexpected existing column');
  const [index] = await db.query("SELECT COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_import_items' AND INDEX_NAME='ux_email_item' ORDER BY SEQ_IN_INDEX");
  if (index.length!==3 || index.map(x=>x.COLUMN_NAME).join(',')!=='run_id,message_id,part_path' || index.some(x=>x.SUB_PART!==null || Number(x.NON_UNIQUE)!==0 || x.INDEX_TYPE!=='BTREE')) throw Error('REFUSED: unique index differs');
  const keyBytes = columns.filter(x=>x.COLUMN_NAME!=='message_id').reduce((n,x)=>n+Number(x.CHARACTER_OCTET_LENGTH),512);
  if (!Number.isFinite(keyBytes) || keyBytes+6>3072) throw Error('REFUSED: index size exceeds supported limit');
  const [[data]] = await db.query("SELECT COUNT(*) AS rows_checked, COALESCE(SUM(CHAR_LENGTH(message_id)>512),0) AS overlength, COALESCE(SUM(HEX(CONVERT(message_id USING utf8mb4)) NOT REGEXP '^([0-7][0-9A-F])*$'),0) AS non_ascii FROM email_import_items");
  if (Number(data.overlength)!==0 || Number(data.non_ascii)!==0) throw Error('REFUSED: data is not safe for lossless ASCII conversion');
  const complete = Number(message.CHARACTER_MAXIMUM_LENGTH)===512 && message.CHARACTER_SET_NAME==='ascii' && message.COLLATION_NAME==='ascii_bin';
  return {database:identity.db,mysqlVersion:identity.version,rowFormat:table.ROW_FORMAT,rowsChecked:Number(data.rows_checked),nonAscii:0,overlength:0,indexKeyBytes:keyBytes,column:{length:Number(message.CHARACTER_MAXIMUM_LENGTH),charset:message.CHARACTER_SET_NAME,collation:message.COLLATION_NAME},plan:complete?[]:[SQL]};
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length>1 || args.some(x=>x!=='--apply'))throw Error('REFUSED: unsupported argument');
  const cfg=dotenv.parse(fs.readFileSync(path.join(__dirname,'../.env')));
  if(cfg.DB_DATABASE!=='keepintax-dev')throw Error('REFUSED: only keepintax-dev is authorized');
  const script=fs.readFileSync(path.join(__dirname,'../../docs/features/outlook-email.sql'),'utf8').split(/\r?\n/).filter(x=>!x.trim().startsWith('--')).join('\n').trim().replace(/;$/,'');
  if(script!==SQL)throw Error('REFUSED: approved SQL differs');
  const db=await mysql.createConnection({host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USERNAME,password:cfg.DB_PASSWORD,database:'keepintax-dev',connectTimeout:10000,multipleStatements:false});
  let locked=false;
  try {
    if(args.includes('--apply')) {
      const [[lock]]=await db.query("SELECT GET_LOCK('keepintax-dev:outlook-schema',10) AS acquired");
      if(Number(lock.acquired)!==1)throw Error('REFUSED: maintenance lock unavailable');
      locked=true;
      await db.query('SET SESSION lock_wait_timeout=10');
      await db.query("SET SESSION sql_mode=CONCAT_WS(',',@@SESSION.sql_mode,'STRICT_ALL_TABLES')");
    }
    const before=await inspect(db);
    console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'inspect',...before}));
    if(!args.includes('--apply'))return;
    for(const sql of before.plan)await db.query(sql);
    const after=await inspect(db);
    if(after.plan.length || after.rowsChecked!==before.rowsChecked)throw Error('Verification failed: schema incomplete or concurrent row count changed');
    console.log(JSON.stringify({verified:true,ddlStatementsApplied:before.plan.length,...after}));
  }finally{
    if(locked)await db.query("SELECT RELEASE_LOCK('keepintax-dev:outlook-schema')").catch(()=>{});
    await db.end();
  }
}
if(require.main===module)main().catch(error=>{console.error('DEV Outlook schema failed: '+(error.code||(/^(REFUSED:|Verification failed:)/.test(error.message)?error.message:'unexpected error')));process.exitCode=1;});
module.exports={inspect};
