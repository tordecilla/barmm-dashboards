'use strict';
// Read-only static equivalent of the local COA API, using exact compressed shards.
const coaFiles=new Map();
async function coaFile(dataset,name){
 const key=dataset+'/'+name;
 if(!coaFiles.has(key))coaFiles.set(key,(async()=>{
  const response=await fetch('runtime/'+dataset+'/'+name+'.json.gz');
  if(!response.ok)throw Error('Could not load the selected COA records.');
  const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
 })().catch(error=>{coaFiles.delete(key);throw error;}));
 return coaFiles.get(key);
}
const coaCanonical=r=>r.metric==='main_16_period_result_surplus_deficit_for_the_period'&&r.entity_id==='basilan'?'surplus_deficit':metricAliases[r.metric]||r.metric;
async function staticCoaJSON(dataset,path){
 const url=new URL(path,'https://static.invalid'),parts=url.pathname.split('/').filter(Boolean),q=url.searchParams;
 if(parts[0]==='bootstrap'||parts[0]==='metrics')return structuredClone(await coaFile(dataset,parts[0]));
 if(parts[0]==='record'){
  const category=parts[1],id=Number(parts[2]),mapping=await coaFile(dataset,'record-entities');
  const eid=mapping[category]?.[id];if(!eid)throw Error('COA record not found.');
  const rows=await coaFile(dataset,'entities/'+eid);return structuredClone(rows[category].find(r=>r.record_id===id));
 }
 if(parts[0]==='entity'){
  const eid=decodeURIComponent(parts[1]),full=await coaFile(dataset,'entities/'+eid),boot=await coaFile(dataset,'bootstrap'),categories={};
  for(const cat of ['financials','findings','financial_note_disclosures','source_document_context']){
   if(['financial_note_disclosures','source_document_context'].includes(cat))categories[cat]=full[cat].map(r=>({...r.record,_record_id:r.record_id,_full:true}));
   else {
    const names=cat==='financials'?boot.financial_years.map(y=>'financials-'+y):[cat];
    categories[cat]=(await Promise.all(names.map(n=>coaFile(dataset,n)))).flat().filter(r=>r.entity_id===eid);
   }
  }
  return structuredClone({categories,issues:boot.source_issues.find(r=>r.entity_id===eid)||{entity_id:eid,issues:[]}});
 }
 if(parts[0]==='records'){
  const category=q.get('category'),boot=await coaFile(dataset,'bootstrap');
  const names=category==='financials'?(q.has('year')?['financials-'+q.get('year')]:boot.financial_years.map(y=>'financials-'+y)):[category];
  let rows=(await Promise.all(names.map(n=>coaFile(dataset,n)))).flat();
  if(q.has('entity'))rows=rows.filter(r=>r.entity_id===q.get('entity'));
  if(q.has('year'))rows=rows.filter(r=>(r.year??r.report_year)===Number(q.get('year')));
  if(q.has('metric'))rows=rows.filter(r=>q.get('metric')==='__overview__'?overviewMetrics.includes(coaCanonical(r)):coaCanonical(r)===q.get('metric'));
  rows.sort((a,b)=>a._record_id-b._record_id);
  if(q.get('full')==='true'){
   const entities=new Map(await Promise.all([...new Set(rows.map(r=>r.entity_id))].map(async eid=>[eid,await coaFile(dataset,'entities/'+eid)])));
   const exact=new Map();for(const categories of entities.values())for(const r of categories[category])exact.set(r.record_id,r.record);
   rows=rows.map(r=>({...exact.get(r._record_id),_record_id:r._record_id,_full:true}));
  }
  return structuredClone({category,records:rows});
 }
 throw Error('Unknown COA request.');
}
