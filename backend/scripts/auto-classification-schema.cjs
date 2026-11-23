'use strict';
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const TABLES=['agent_auto_preferences','agent_auto_items'];
const COLUMNS={classified_transactions:['createdBySource','updatedBySource'],slim_transactions:['classificationSource'],full_transactions_cache:['classificationSource']};
function target(args,env){
 if(args.length!==2 || !['--check','--apply'].includes(args[1]))throw new Error('AUTO_SCHEMA_ARGUMENTS');
 if(args[0]==='--database=auto_classification_test'){
  const url=new URL(env.AUTO_CLASSIFICATION_TEST_MYSQL_URL || '');
  if(!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname!=='/auto_classification_test')throw new Error('AUTO_SCHEMA_LOCAL_TARGET');
  return {uri:url.toString(),database:'auto_classification_test',mode:args[1]};
 }
 if(args[0]!=='--database=keepintax-dev' || env.DB_DATABASE!=='keepintax-dev' || !env.DB_HOST || !env.DB_USERNAME)throw new Error('AUTO_SCHEMA_TARGET_NOT_APPROVED');
 return {host:env.DB_HOST,port:Number(env.DB_PORT || 3306),user:env.DB_USERNAME,password:env.DB_PASSWORD,database:'keepintax-dev',mode:args[1]};
}
function statements(raw){
 const result=raw.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
 if(result.length!==5)throw new Error('AUTO_SCHEMA_STATEMENT_COUNT');
 for(let i=0;i<2;i++)if(!result[i].startsWith('CREATE TABLE IF NOT EXISTS '+TABLES[i]+' ('))throw new Error('AUTO_SCHEMA_CREATE_NOT_ALLOWLISTED');
 const alterations=result.slice(2).map(sql=>{
  const match=/^ALTER TABLE (\w+) ([\s\S]+)$/.exec(sql);if(!match || !COLUMNS[match[1]])throw new Error('AUTO_SCHEMA_ALTER_NOT_ALLOWLISTED');
  const columns=match[2].split(/,\s*(?=ADD COLUMN)/).map(part=>{
   const col=/^ADD COLUMN (\w+) varchar\(10\) NULL$/i.exec(part.trim());if(!col || !COLUMNS[match[1]].includes(col[1]))throw new Error('AUTO_SCHEMA_COLUMN_NOT_ALLOWLISTED');return col[1];
  });
  if(columns.join(',')!==COLUMNS[match[1]].join(','))throw new Error('AUTO_SCHEMA_COLUMNS_MISMATCH');
  return {table:match[1],columns};
 });
 if(alterations.map(a=>a.table).join(',')!==Object.keys(COLUMNS).join(','))throw new Error('AUTO_SCHEMA_TABLE_ORDER');
 return {creates:result.slice(0,2),alterations};
}
async function apply(conn,raw,database,write){
 const [identity]=await conn.query('SELECT DATABASE() AS selected_database');
 if(!['auto_classification_test','keepintax-dev'].includes(database) || identity[0].selected_database!==database)throw new Error('AUTO_SCHEMA_CONNECTED_DATABASE_MISMATCH');
 const plan=statements(raw);
 const [prerequisites]=await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('agent_onboarding_profiles','classified_transactions','slim_transactions','full_transactions_cache')");
 if(prerequisites.length!==4)throw new Error('AUTO_SCHEMA_PREREQUISITES_MISSING');
 if(write)for(const sql of plan.creates)await conn.query(sql);
 const missing=[];
 for(const {table,columns} of plan.alterations)for(const column of columns){
  const [rows]=await conn.query('SELECT DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',[table,column]);
  if(!rows.length){if(write)await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} varchar(10) NULL`);else missing.push(table+'.'+column);}
  else if(rows[0].DATA_TYPE!=='varchar' || Number(rows[0].CHARACTER_MAXIMUM_LENGTH)!==10 || rows[0].IS_NULLABLE!=='YES')throw new Error('AUTO_SCHEMA_EXISTING_COLUMN_MISMATCH');
 }
 for(let i=0;i<plan.creates.length;i++){
  const expected=[...plan.creates[i].matchAll(/(?:\(|,)\s*([a-z][a-z_0-9]*)\s+(varchar|boolean|int|bigint|datetime|text|json)\b/gi)].map(m=>m[1]);
  const [columns]=await conn.query('SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[TABLES[i]]);
  const actual=columns.map(c=>c.COLUMN_NAME);
  for(const column of expected)if(!actual.includes(column))missing.push(TABLES[i]+'.'+column);
 }
 if(write && missing.length)throw new Error('AUTO_SCHEMA_VERIFICATION_FAILED');
 return {database,missing,schemaSha256:createHash('sha256').update(raw).digest('hex'),mode:write?'apply':'check'};
}
async function main(){
 const args=process.argv.slice(2);
 if(args[0]==='--database=keepintax-dev')require('dotenv').config({path:join(__dirname,'../.env'),quiet:true});
 const config=target(args,process.env),{mode,database,...connection}=config;
 const mysql=require('mysql2/promise');
 const conn=await mysql.createConnection({...connection,database,multipleStatements:false,timezone:'Z',connectTimeout:10000});
 try {const result=await apply(conn,readFileSync(join(__dirname,'migrations/2026-11-19_auto_classification.sql'),'utf8'),database,mode==='--apply');console.log(JSON.stringify(result));if(result.missing.length)process.exitCode=2;}
 finally{await conn.end();}
}
module.exports={target,statements,apply};
if(require.main===module)main().catch(error=>{console.error(error.code || error.message || 'AUTO_SCHEMA_FAILED');process.exitCode=1;});
