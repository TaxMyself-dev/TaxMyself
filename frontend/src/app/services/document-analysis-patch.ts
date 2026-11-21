const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
/** A late analysis may fill untouched controls, never overwrite user edits or their dependent choices. */
export function safeAnalysisPatch(proposed:Record<string,any>,snapshot:Record<string,any>,current:Record<string,any>,dirty:ReadonlySet<string>):Record<string,any>{
  const patch=Object.fromEntries(Object.entries(proposed).filter(([key])=>!dirty.has(key)&&same(snapshot[key],current[key])));
  const dependencies:Record<string,string[]>={supplier:['supplierId'],category:['subCategory','taxPercent','vatPercent','isEquipment']};
  for(const [parent,children] of Object.entries(dependencies))if(dirty.has(parent)||!same(snapshot[parent],current[parent]))for(const child of children)delete patch[child];
  return patch;
}
