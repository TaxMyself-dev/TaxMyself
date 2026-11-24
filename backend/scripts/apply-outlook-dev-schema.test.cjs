const {test}=require('node:test');const assert=require('node:assert/strict');
const {inspect}=require('./apply-outlook-dev-schema.cjs');
function database(over={}){
 const columns=[{COLUMN_NAME:'run_id',CHARACTER_OCTET_LENGTH:144},{COLUMN_NAME:'message_id',DATA_TYPE:'varchar',CHARACTER_MAXIMUM_LENGTH:128,CHARACTER_SET_NAME:'utf8mb4',COLLATION_NAME:'utf8mb4_0900_ai_ci',IS_NULLABLE:'NO',...over.column},{COLUMN_NAME:'part_path',CHARACTER_OCTET_LENGTH:640}];
 const index=['run_id','message_id','part_path'].map(COLUMN_NAME=>({COLUMN_NAME,SUB_PART:null,NON_UNIQUE:0,INDEX_TYPE:'BTREE'}));
 const seen=[];
 return {seen,async query(sql){seen.push(sql);assert.ok(sql.startsWith('SELECT '),'inspection must be read-only');
  if(sql.startsWith('SELECT DATABASE'))return [[{db:over.db||'keepintax-dev',version:'8.0.37'}]];
  if(sql.includes('information_schema.TABLES'))return [[{ENGINE:'InnoDB',ROW_FORMAT:over.rowFormat||'Dynamic'}]];
  if(sql.includes('information_schema.COLUMNS'))return [columns];
  if(sql.includes('information_schema.STATISTICS'))return [over.index||index];
  if(sql.includes('COUNT(*)'))return [[{rows_checked:408,overlength:0,non_ascii:0,...over.data}]];
  throw Error('Unexpected query');
 }};
}
test('plans exactly the approved single-column ALTER without any writes',async()=>{const db=database();const result=await inspect(db);assert.equal(result.plan.length,1);assert.match(result.plan[0],/^ALTER TABLE email_import_items\n  MODIFY COLUMN message_id VARCHAR\(512\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL$/);assert.equal(result.indexKeyBytes,1296);assert.equal(result.rowsChecked,408);});
test('refuses production before any schema/data queries',async()=>{const db=database({db:'keepintax-prod'});await assert.rejects(inspect(db),/runtime database mismatch/);assert.equal(db.seen.length,1);});
test('recognizes the applied schema as an empty plan',async()=>{const result=await inspect(database({column:{CHARACTER_MAXIMUM_LENGTH:512,CHARACTER_SET_NAME:'ascii',COLLATION_NAME:'ascii_bin'}}));assert.deepEqual(result.plan,[]);});
test('refuses non-ASCII or overlength data',async()=>{for(const data of [{non_ascii:1},{overlength:1}])await assert.rejects(inspect(database({data})),/lossless ASCII/);});
test('refuses truncated or changed unique indexes',async()=>{await assert.rejects(inspect(database({index:[{COLUMN_NAME:'message_id',SUB_PART:128,NON_UNIQUE:0,INDEX_TYPE:'BTREE'}]})),/unique index differs/);});
test('refuses an incompatible row format or unexpected column size',async()=>{await assert.rejects(inspect(database({rowFormat:'Compact'})),/row format/);await assert.rejects(inspect(database({column:{CHARACTER_MAXIMUM_LENGTH:64}})),/unexpected existing column/);});
