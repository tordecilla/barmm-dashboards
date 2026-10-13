'use strict';
const $=s=>document.querySelector(s);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const integer=new Intl.NumberFormat('en-PH',{maximumFractionDigits:0});
const money=value=>value==null?'Not reported':number.format(value);
const contextText=value=>typeof value==='object'&&value!==null?Object.entries(value).map(([key,item])=>`${key.replaceAll('_',' ')}: ${typeof item==='object'?JSON.stringify(item):item}`).join(' · '):value??'';
const financialValue=r=>r.value==null?(r.status==='conflicting'?'Conflicting':r.status==='unreadable'?'Unreadable':'Not reported'):`${money(r.value)}${r.unit==='percent'?'%':''}`;
const budgetColumnLabels={original_budget:'Original budget',final_budget:'Final budget',difference_original_final:'Difference: original and final budget',actual_amount:'Actual amount',actual_comparable_basis:'Actual amount on comparable basis',difference_final_actual:'Difference: final budget and actual'};
const labels={overview:'Financial overview',assets:'Assets',liabilities:'Liabilities',equity:'Government equity',revenue:'Revenue',expenses:'Operating expenses',surplus_deficit:'Surplus / deficit',appropriation:'Appropriations',allotment:'Allotments',obligation:'Obligations',disbursement:'Disbursements',net_transfers:'Net transfers / subsidies',net_transfers_assistance_subsidy:'Net transfers / subsidies',transfers_assistance_subsidy_from:'Transfers / subsidies from',transfers_assistance_subsidy_to:'Transfers / subsidies to',opinions:'Audit opinions',recommendations:'Prior recommendations',findings:'Audit observations',coverage:'Coverage & review',sources:'Source documents'};
const overviewMetrics=['assets','liabilities','equity','revenue','expenses','surplus_deficit'];
const financialMetrics=['assets','liabilities','equity','revenue','expenses','surplus_deficit','appropriation','allotment','obligation','disbursement','net_transfers'];
const metricAliases={net_transfers_assistance_subsidy:'net_transfers',transfer_assistance_subsidy_net:'net_transfers',transfers_assistance_subsidy_net:'net_transfers',transfers_from:'transfers_assistance_subsidy_from',transfer_assistance_subsidy_from:'transfers_assistance_subsidy_from','transfers,_assistance_and_subsidy_from':'transfers_assistance_subsidy_from',transfers_to:'transfers_assistance_subsidy_to',transfer_assistance_subsidy_to:'transfers_assistance_subsidy_to','transfers,_assistance_and_subsidy_to':'transfers_assistance_subsidy_to',surplus_from_current_operations:'surplus_current_operations',transfer_assistance_subsidy:'transfers_assistance_subsidy'};
const metricKey=(id,entityId)=>id==='main_16_period_result_surplus_deficit_for_the_period'&&(!entityId||entityId==='basilan')?'surplus_deficit':Object.hasOwn(metricAliases,id)?metricAliases[id]:id;
const allowedIndicators=new Set(['overview',...financialMetrics,'opinions','recommendations','findings','coverage','sources']);
const params=new URLSearchParams(location.search);
const state={indicator:allowedIndicators.has(params.get('indicator'))?params.get('indicator'):'overview',level:['local','province','all'].includes(params.get('level'))?params.get('level'):'local',year:Number(params.get('year'))||2024,view:params.get('view')==='chart'?'chart':'table',search:params.get('search')||'',topic:params.get('topic')||'',area:params.get('area')||'',lgu:params.get('lgu')||'',sort:'name',direction:1};
let data,exportRows=[],detailOpener;
state.dataset=['followups','notices'].includes(params.get('dataset'))?params.get('dataset'):'summary';
state.entityClass=params.get('entity_class')==='ministries'?'ministries':'lgu';
const assetPath=path=>/^https?:/.test(path)?path:(state.entityClass==='ministries'?'ministries/2024/':'')+path+(/\.(json|jsonl|csv)$/.test(path)&&path!=='release-coverage.csv'?'.gz':'');
const isFinancial=()=>financialMetrics.includes(state.indicator)||state.indicator==='overview';
const matchesFinancialYear=(r,year)=>r.year===year||(r.year==null&&r.report_year===year);
const records=(id,metric,year=state.year)=>data.financials.filter(r=>r.entity_id===id&&matchesFinancialYear(r,year)&&metricKey(r.metric,r.entity_id)===metric);
const opinion=id=>data.opinions.find(r=>r.entity_id===id);
const status=id=>data.recommendation_status.find(r=>r.entity_id===id);
const entity=id=>data.entities.find(e=>e.entity_id===id);
const coverage=id=>data.entity_coverage.find(e=>e.entity_id===id);
const missingLabel=id=>coverage(id)?.extraction_status==='no_report_in_local_scrape'?'Report not located':'Pending review';
const issues=id=>data.source_issues.find(e=>e.entity_id===id)?.issues||[];
const safeURL=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
function citationHTML(c){
  const source=data.sources[c?.source_id];
  if(!source)return '<span class="missing">Source unavailable</span>';
  const path=source.public_path?assetPath(source.public_path):null;
  if(path)return `<a class="source-link" href="${escape(path)}#page=${Number(c.pdf_page)||1}" target="_blank" rel="noopener">PDF p. ${escape(c.pdf_page||1)} ↗</a>`;
  const url=safeURL(source.source_url);
  return url?`<a class="source-link" href="${escape(url)}" target="_blank" rel="noopener">COA download ↗</a>`:'<span class="missing">Source unavailable</span>';
}
function sourceActions(c){
  const source=data.sources[c?.source_id];
  if(!source)return '';
  const url=safeURL(source.source_url);
  return `<div class="source-actions">${citationHTML(c)}${url?`<a href="${escape(url)}" target="_blank" rel="noopener">Original COA download ↗</a>`:''}</div><dl class="metadata"><dt>Document</dt><dd>${escape(source.archive_member||source.kind.replaceAll('_',' '))}</dd><dt>Physical page</dt><dd>${escape(c.pdf_page||'Not specified')} of ${source.page_count}${c.printed_page?` · printed page ${escape(c.printed_page)}`:''}</dd></dl>${c.excerpt?`<blockquote class="evidence">${escape(c.excerpt)}</blockquote>`:''}`;
}
function placeHTML(e){return `<div class="place"><button ${['opinions','findings'].includes(state.indicator)?'data-observations':'data-entity'}="${escape(e.entity_id)}">${escape(e.name)}</button>${e.entity_type==='Province'?'<small>PROVINCIAL GOVERNMENT</small>':e.entity_type==='City'?'<small>CITY</small>':''}${!state.area&&e.province?`<small>${escape(e.province)}</small>`:''}${issues(e.entity_id).length?'<button class="row-warning" data-entity="'+escape(e.entity_id)+'">Source & review notes</button>':''}</div>`;}
function badge(value){
  const text={unmodified:'Unmodified',qualified:'Qualified',adverse:'Adverse',disclaimer:'Disclaimer',conflicting:'Conflicting',not_reported:'Not reported'}[value]||'Pending review';
  return `<span class="badge ${value==='qualified'||value==='conflicting'?'warn':!value?'neutral':''}">${text}</span>`;
}
function financialCell(e,metric){
  const rows=records(e.entity_id,metric);
  if(!rows.length)return `<span class="missing">${missingLabel(e.entity_id)}</span>`;
  if(rows.length>1)return `<button class="record" data-financial="${e.entity_id}" data-metric="${metric}">${rows.length} source records</button>`;
  const r=rows[0];
  return `<button class="record ${r.value<0?'negative':''}" data-financial="${e.entity_id}" data-metric="${metric}" aria-label="${escape(e.name)}: ${escape(labels[metric])}, ${escape(money(r.value))}, view source">${r.value==null?escape(r.status==='unreadable'?'Unreadable':r.status==='conflicting'?'Conflicting':'Not reported'):money(r.value)}</button>`;
}
function selectedEntities(){
  return data.entities.filter(e=>(state.level==='all'||(state.level==='province'?e.entity_type==='Province':e.entity_type!=='Province'))&&(!state.area||e.province===state.area)&&(!state.lgu||state.lgu===e.entity_id)&&e.name.toLowerCase().includes(state.search.toLowerCase())).sort((a,b)=>{
    if(state.sort==='name')return state.direction*a.name.localeCompare(b.name);
    const av=records(a.entity_id,state.sort),bv=records(b.entity_id,state.sort);
    const value=rows=>rows.length===1?rows[0].value:null;
    if(value(av)==null)return value(bv)==null?a.name.localeCompare(b.name):1;
    if(value(bv)==null)return -1;
    return state.direction*(value(av)-value(bv));
  });
}
function table(headers,rows){return `<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" class="empty">No matching records</td></tr>`}</tbody></table></div>`;}
function sortHeading(label,key){return `<button class="sort" data-sort="${key}">${escape(label)} ${state.sort===key?(state.direction===1?'↑':'↓'):'↕'}</button>`;}
function stat(value,label){return `<div class="stat"><strong>${integer.format(value)}</strong><span>${label}</span></div>`;}
function financialCSVBase(r,e){const s=data.sources[r?.citation?.source_id];return {LGU:e.name,province:e.province,government_type:e.entity_type,financial_year:r?r.year??'':state.year,report_year:r?.report_year||2024,metric:r?.metric||state.indicator,value:r?.value??null,unit:r?.unit||'PHP',unit_basis:r?.unit_basis||'',unit_citation:JSON.stringify(r?.unit_citation||null),unit_assignment:r?.unit_assignment?typeof r.unit_assignment==='object'?JSON.stringify(r.unit_assignment):r.unit_assignment:'',source_unit_citation:JSON.stringify(r?.source_unit_citation||null),source_currency_glyph_citation:JSON.stringify(r?.source_currency_glyph_citation||null),fund_scope:r?.fund_scope||'',source_row:r?.source_label||'',source_table:r?.source_table||'',source_context:r?.source_context?typeof r.source_context==='object'?JSON.stringify(r.source_context):r.source_context:'',source_section:r?.source_section||'',source_scope_qualification:r?.source_scope_qualification||'',section_heading_citations:JSON.stringify(r?.section_heading_citations||[]),budget_column:r?.budget_column||'',source_column:r?.source_column_label||r?.source_column||'',source_note_reference:r?.source_note_reference??'',note_reference_cell_state:r?.note_reference_cell_state||'',continuation_citations:JSON.stringify(r?.continuation_citations||[]),equivalent_source_citations:JSON.stringify(r?.equivalent_source_citations||[]),printed_cell:r?.source_cell_as_printed??r?.value_as_printed??r?.source_cell??'',source_cell_state:r?.source_cell_state||r?.cell_state||'',source_notes:r?JSON.stringify([r.issues,r.source_issues,r.source_issue,r.source_limitations].filter(Boolean)):'',status:r?(r.value==null?r.status:'verified'):missingLabel(e.entity_id)==='Report not located'?'report_not_located':'pending_review',source_url:s?.source_url||'',archive_member:s?.archive_member||'',pdf_page:r?.citation?.pdf_page||''};}
function financialCSV(r,e){
  return {...financialCSVBase(r,e),scope_citation:JSON.stringify(r?.scope_citation||null),
    fund_citation:JSON.stringify(r?.fund_citation||null),
    source_fund_scope_qualification:r?.source_fund_scope_qualification||'',
    source_fund_scope_continuation_citation:JSON.stringify(r?.source_fund_scope_continuation_citation||null),
    source_fund_scope_cross_reference_citation:JSON.stringify(r?.source_fund_scope_cross_reference_citation||null),
    source_date_label_limitation:r?.source_date_label_limitation||'',source_unit_basis:r?.source_unit_basis||'',
    source_field_citations:JSON.stringify(Object.fromEntries(Object.entries(r||{}).filter(([key])=>key==='citation'||key.endsWith('_citation')||key.endsWith('_citations'))))};
}
function renderOverview(entities){
  exportRows=entities.map(e=>{
    const row={LGU:e.name,province:e.province,government_type:e.entity_type,financial_year:state.year,report_year:2024,unit:'PHP'};
    for(const metric of overviewMetrics){const rs=records(e.entity_id,metric);row[metric]=!rs.length?missingLabel(e.entity_id):rs.length===1?rs[0].value??'Not reported':rs.map(r=>`${financialValue(r)} [${r.fund_scope}; PDF p.${r.citation.pdf_page}]`).join(' | ');row[metric+'_fund_scope']=rs.map(r=>r.fund_scope).join(' | ');row[metric+'_source_url']=rs.map(r=>data.sources[r.citation.source_id]?.source_url||'').join(' | ');row[metric+'_pdf_page']=rs.map(r=>r.citation.pdf_page).join(' | ');}
    row.audit_opinion=opinion(e.entity_id)?.classification||'Pending review';return row;
  });
  return table([sortHeading('LGU','name'),...overviewMetrics.map(m=>sortHeading(labels[m],m)),'2024 opinion'],entities.map(e=>`<tr><td>${placeHTML(e)}</td>${overviewMetrics.map(m=>`<td class="number">${financialCell(e,m)}</td>`).join('')}<td><button class="record" data-opinion="${e.entity_id}">${badge(opinion(e.entity_id)?.classification)}</button></td></tr>`));
}
function renderFinancial(entities){
  exportRows=[];const rows=[];
  for(const e of entities){const rs=records(e.entity_id,state.indicator);for(const r of rs.length?rs:[null]){
    exportRows.push(financialCSV(r,e));
    rows.push(`<tr><td>${placeHTML(e)}</td><td class="number">${r?`<button class="record ${r.value<0?'negative':''}" data-record="${data.financials.indexOf(r)}">${financialValue(r)}</button>`:`<span class="missing">${missingLabel(e.entity_id)}</span>`}</td><td class="scope">${escape(r?.fund_scope||'—')}</td><td>${r?`${escape(r.source_label)}${r.source_context?`<span class="finding-topic">${escape(contextText(r.source_context))}</span>`:''}${r.budget_column?`<span class="finding-topic">${escape(budgetColumnLabels[r.budget_column]||r.budget_column)}</span>`:''}`:'—'}</td><td>${r?citationHTML(r.citation):'—'}</td></tr>`);
  }}
  const units=[...new Set(entities.flatMap(e=>records(e.entity_id,state.indicator)).map(r=>r.unit).filter(Boolean))];
  const rendered=table([sortHeading('LGU','name'),sortHeading(`Value${units.length===1?' · '+units[0]:''}`,state.indicator),'Fund / scope as recorded','Source row','Source'],rows);
  return state.view==='chart'?renderChart(entities)+rendered:rendered;
}
function renderChart(entities){
  const points=[];let multiple=0;
  for(const e of entities){const rs=records(e.entity_id,state.indicator);if(rs.length>1){multiple++;continue;}if(rs.length===1&&rs[0].value!=null)points.push({e,r:rs[0]});}
  points.sort((a,b)=>b.r.value-a.r.value);
  if(!points.length)return '<div class="empty">No unambiguous reviewed values to chart.</div>';
  const low=Math.min(0,...points.map(p=>p.r.value)),high=Math.max(0,...points.map(p=>p.r.value)),range=high-low||1;
  const zero=100*(-low)/range;
  return `<div class="chart-list"><div class="chart-axis"><span>PHP ${money(low)}</span><span>PHP ${money(high)}</span></div>${points.map(({e,r})=>{
    const start=100*(Math.min(0,r.value)-low)/range,width=100*Math.abs(r.value)/range;
    return `<div class="chart-row"><button class="chart-label" data-record="${data.financials.indexOf(r)}">${escape(e.name)}</button><div class="track" style="--zero:${zero}%"><span class="bar ${r.value<0?'neg':''}" style="left:${start}%;width:${width}%"></span></div><span class="chart-value ${r.value<0?'negative':''}">${financialValue(r)}</span></div>`;
  }).join('')}</div><p class="data-note">${points.length} LGUs plotted${multiple?` · ${multiple} LGUs with multiple source records remain in the table`:''}. All table records appear below.</p>`;
}
function renderOpinions(entities){
  exportRows=entities.map(e=>({LGU:e.name,government_type:e.entity_type,report_year:2024,opinion:opinion(e.entity_id)?.classification||'pending_review',source_wording:opinion(e.entity_id)?.source_wording||'',basis:opinion(e.entity_id)?.basis||'',key_audit_matters:opinion(e.entity_id)?.key_audit_matters||'',report_sections:JSON.stringify(opinion(e.entity_id)?.report_sections||[]),report_signatories:JSON.stringify(opinion(e.entity_id)?.report_signatories||opinion(e.entity_id)?.signatories||[]),pdf_page:opinion(e.entity_id)?.citation?.pdf_page||'',source_url:data.sources[opinion(e.entity_id)?.citation?.source_id]?.source_url||''}));
  return table([sortHeading('LGU','name'),'Opinion','Source'],entities.map(e=>{const r=opinion(e.entity_id);return `<tr><td>${placeHTML(e)}</td><td><button class="record" data-opinion="${e.entity_id}">${badge(r?.classification)}</button></td><td>${r?citationHTML(r.citation):'—'}</td></tr>`;}));
}
function renderRecommendations(entities){
  if(state.dataset==='followups')return renderAnnexRows(entities,'recommendation_followups');
  const keys=['total','fully_implemented','partially_implemented','not_implemented'];
  exportRows=entities.map(e=>({LGU:e.name,report_year:2024,...Object.fromEntries(keys.map(k=>[k,status(e.entity_id)?.[k]??'Not reported'])),review_status:status(e.entity_id)?'verified':'pending_review'}));
  return table([sortHeading('LGU','name'),'Prior recommendations','Fully implemented','Partially implemented','Not implemented','Source'],entities.map(e=>{const r=status(e.entity_id);return `<tr><td>${placeHTML(e)}</td>${keys.map(k=>`<td class="number">${r?(r[k]==null?'<span class="missing">Not reported</span>':integer.format(r[k])):'<span class="missing">Pending review</span>'}</td>`).join('')}<td>${r?`<button class="record" data-status="${e.entity_id}">View status & source</button>`:'—'}</td></tr>`;}));
}
function renderFindings(entities){
  if(state.dataset==='notices')return renderAnnexRows(entities,'notices');
  const ids=new Set(entities.map(e=>e.entity_id));
  const rows=data.findings.filter(r=>ids.has(r.entity_id)&&(!state.topic||findingTopics(r).includes(state.topic))).sort((a,b)=>a.entity_name.localeCompare(b.entity_name)||Number(a.source_number)-Number(b.source_number));
  exportRows=rows.map(r=>({LGU:r.entity_name,report_year:2024,observation:r.source_number,title:r.title,summary:r.summary,source_narrative:r.source_narrative||r.full_observation_text||'',source_narrative_citations:JSON.stringify([...(r.source_narrative_citations||[]),...(r.source_segments||[]).map(segment=>segment.citation)].filter(Boolean)),topics:(r.topics||[]).join(' | '),topic_groups:findingTopics(r).join(' | '),amounts:(r.amounts||[]).map(a=>`${a.value} ${a.unit}; ${a.meaning}`).join(' | '),recommendation:r.recommendation||'',management_response:r.management_response||'',repeated_explicitly:r.repeated_explicitly??'',repeated_explicitly_scope:r.repeated_explicitly_scope||'',repeated_explicitly_citations:JSON.stringify(r.repeated_explicitly_citations||[]),source_notes:JSON.stringify([r.issues,r.source_issues,r.source_issue,r.source_limitations].filter(Boolean)),supporting_schedules:JSON.stringify(r.supporting_schedules||[]),pdf_page:r.citation.pdf_page,source_url:data.sources[r.citation.source_id]?.source_url||''}));
  return table(['LGU','No.','Observation','Amounts in source','Source'],rows.map(r=>`<tr><td>${placeHTML(entity(r.entity_id))}</td><td class="finding-number">${escape(r.source_number)}</td><td class="finding-title"><button class="record" data-finding="${data.findings.indexOf(r)}">${escape(r.title)}</button><span class="finding-topic">${escape(findingTopics(r).join(' · '))}</span></td><td class="number">${(r.amounts||[]).length?(r.amounts||[]).map(a=>`${a.unit==='count'?integer.format(a.value):money(a.value)} ${escape(a.unit||'')}`).join('<br>'):'<span class="missing">No amount recorded</span>'}</td><td>${citationHTML(r.citation)}</td></tr>`));
}
function renderAnnexRows(entities,category){
  const ids=new Set(entities.map(e=>e.entity_id)),rows=(data[category]||[]).filter(r=>ids.has(r.entity_id));
  const value=v=>v==null||v===''?'<span class="missing">Not reported</span>':Array.isArray(v)?v.map(escape).join('<br>'):escape(v);
  exportRows=rows.map(r=>({LGU:r.entity_name,report_year:r.report_year,source_reference:r.source_reference,source_document:r.source_document||data.sources[r.citation.source_id]?.kind,source_id:r.citation.source_id,original_report_year:r.original_report_year,original_report_year_reference:r.original_report_year_reference,notice_type:r.notice_type,period:r.period,as_of:r.as_of||r.status_as_of,recommendation:r.recommendation,observation_context:r.observation_context,agency_status:r.agency_status,coa_status:Array.isArray(r.coa_status)?JSON.stringify(r.coa_status):r.coa_status,date_of_follow_up:r.date_of_follow_up,action_plan:r.action_plan,action_plan_visible_text:r.action_plan_visible_text,observation:r.observation,field_extraction_status:r.field_extraction_status?JSON.stringify(r.field_extraction_status):'',source_notes:JSON.stringify([r.issues,r.source_issues,r.source_issue,r.source_limitations].filter(Boolean)),responsible:r.responsible,target_start:r.target_start,target_end:r.target_end,apmt_target_start:r.apmt_target_start,apmt_target_end:r.apmt_target_end,actual_implementation_date:r.actual_implementation_date,actual_from:r.actual_from??r.actual_implementation_from,actual_to:r.actual_to??r.actual_implementation_to,reason_for_delay:r.reason_for_delay,reason_for_nonimplementation:r.reason_for_nonimplementation,action_taken:r.action_taken,agency_action_taken:r.agency_action_taken,agency_reason:r.agency_reason,source_observation:r.source_observation,source_observation_number:r.source_observation_number,recommendation_parent_context:r.recommendation_parent_context,status_period:r.status_period,observation_citations:r.observation_citations?JSON.stringify(r.observation_citations):'',recommendation_parent_context_citation:r.recommendation_parent_context_citation?JSON.stringify(r.recommendation_parent_context_citation):'',recommendation_continuation_citations:r.recommendation_continuation_citations?JSON.stringify(r.recommendation_continuation_citations):'',reference_citation:r.reference_citation?JSON.stringify(r.reference_citation):'',recommendation_group_context:r.recommendation_group_context,recommendation_overall_context:r.recommendation_overall_context,action_plan_group_context:r.action_plan_group_context,field_completeness:r.field_completeness?JSON.stringify(r.field_completeness):'',source_document_metadata:r.source_document_metadata?JSON.stringify(r.source_document_metadata):'',agency_signoff:r.agency_signoff?JSON.stringify(r.agency_signoff):'',source_status_legend:r.source_status_legend?JSON.stringify(r.source_status_legend):'',action_taken_visible_text:r.action_taken_visible_text,coa_remarks:r.coa_remarks,remarks:r.remarks,field_citations:r.field_citations?JSON.stringify(r.field_citations):'',amounts:(r.amounts||[]).map(a=>`${a.value==null?'Not reported':a.value} ${a.unit||''}; ${a.meaning||''}`).join(' | '),pdf_page:r.citation.pdf_page,source_url:data.sources[r.citation.source_id]?.source_url||''}));
  exportRows=exportRows.map((row,index)=>{
    const source=rows[index];
    return {...row,observation_number:source.observation_number,audit_observation_reference:source.audit_observation_reference,
      recommendation_context:source.recommendation_context,document_signed_date:source.document_signed_date,
      recommendation_source_text:source.recommendation_source_text,reason:source.reason,reasons:source.reasons,
      original_observation:source.original_observation,recommendation_preamble_as_printed:source.recommendation_preamble_as_printed,source_reference_as_printed:source.source_reference_as_printed,source_recommendation_number:source.source_recommendation_number,source_group_number:source.source_group_number,status_as_printed:source.status_as_printed,reference_as_printed:source.reference_as_printed,reference_source_assignment:source.reference_source_assignment?JSON.stringify(source.reference_source_assignment):'',coa_status_assignment:source.coa_status_assignment?typeof source.coa_status_assignment==='object'?JSON.stringify(source.coa_status_assignment):source.coa_status_assignment:'',source_row_segments:source.source_row_segments?JSON.stringify(source.source_row_segments):'',
      source_cell_states:source.source_cell_states?JSON.stringify(source.source_cell_states):'',
      source_citations:JSON.stringify(Object.fromEntries(Object.entries(source).filter(([key])=>key==='citation'||key.endsWith('_citation')||key.endsWith('_citations'))))};
  });
  if(category==='recommendation_followups')return table(['LGU','Reference','Original report year','Recommendation','Agency status','COA status','As of','Source'],rows.map(r=>`<tr><td>${placeHTML(entity(r.entity_id))}</td><td><button class="record" data-followup="${data[category].indexOf(r)}">${value(r.source_reference)}</button></td><td>${value(r.original_report_year??r.original_report_year_reference)}</td><td>${value(r.recommendation)}</td><td>${value(r.agency_status)}</td><td>${value(r.coa_status)}</td><td>${value(r.status_as_of)}</td><td>${citationHTML(r.citation)}</td></tr>`));
  return table(['LGU','Notice type','Reference','Period / as of','Amounts in source','Status','Source'],rows.map(r=>`<tr><td>${placeHTML(entity(r.entity_id))}</td><td>${value(r.notice_type)}</td><td><button class="record" data-notice="${data[category].indexOf(r)}">${value(r.source_reference)}</button></td><td>${value(r.as_of||r.period)}</td><td>${(r.amounts||[]).map(a=>`${value(a.value==null?null:money(a.value))} ${escape(a.unit||'')}<span class="finding-topic">${escape(a.meaning||'')}</span>`).join('')||value(null)}</td><td>${value(r.status||r.source_wording||r.status_source_wording)}</td><td>${citationHTML(r.citation)}</td></tr>`));
}
function openAnnex(category,index){
  const r=data[category][index],titles={recommendation_followups:'Recommendation follow-up',notices:'Audit notice'};
  const fields=Object.entries(r).filter(([k,v])=>!['entity_id','entity_name','entity_type','province','review_status','authored_by','repaired_by','converted_by','stage_record_pointer','stage_status','stage_source_review','source_review_status','staging_note','source_limitations','issues','source_issues','source_issue'].includes(k)&&!k.startsWith('_')&&!k.startsWith('historical_')&&!k.endsWith('_sha256')&&v!=null&&(typeof v!=='object'||Array.isArray(v)&&v.every(item=>item==null||typeof item!=='object')));
  const evidence=[];
  const collect=value=>{if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object'){if(value.source_id&&value.pdf_page)evidence.push(value);else Object.values(value).forEach(collect);}};
  collect(r);
  const fieldStatus=Object.entries(r.field_extraction_status||{});
  const sourceStates=Object.entries(r.source_cell_states||{}).map(([key,metadata])=>{
    const state=typeof metadata==='object'?metadata?.state:metadata;
    const label=state==='blank'?'Blank in source':state==='not_applicable'?'Not applicable':state;
    return label?`<dt>${escape(key.replaceAll('_',' '))} source cell</dt><dd>${escape(label)}</dd>`:'';
  }).join('');
  showDetail(titles[category],r.entity_name,`<dl class="metadata">${fields.map(([k,v])=>`<dt>${escape(k.replaceAll('_',' '))}</dt><dd>${Array.isArray(v)?v.map(escape).join('<br>'):escape(v)}</dd>`).join('')}${fieldStatus.map(([k,v])=>`<dt>${escape(k.replaceAll('_',' '))} extraction status</dt><dd>${escape(typeof v==='object'?JSON.stringify(v):v)}</dd>`).join('')}${sourceStates}${r.reference_source_assignment?`<dt>Printed reference year</dt><dd>${escape(r.reference_source_assignment.printed_reference_year??'Not reported')}</dd><dt>Reference ownership</dt><dd>${escape(r.reference_source_assignment.scope_basis||'')}</dd><dt>Reference cell shared across rows or continuation</dt><dd>${r.reference_source_assignment.merged_reference_or_continuation?'Yes':'No'}</dd>`:''}</dl>${(r.amounts||[]).map(a=>`<p>${money(a.value)} ${escape(a.unit)} — ${escape(a.meaning)}</p>`).join('')}${recordIssuesHTML(r)}<h3>Source evidence</h3>${evidence.map(sourceActions).join('')}${issueHTML(r.entity_id)}`);
}
function publishedCoverage(id){
  const keys=['financials','opinions','recommendation_status','findings','recommendation_followups','notices','financial_note_disclosures','source_document_context'];
  const counts=data.record_counts[id]||Object.fromEntries(keys.map(key=>[key,0]));
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {...counts,label:total?'Partial reviewed subset':coverage(id)?.extraction_status==='no_report_in_local_scrape'?'Report not located':'Awaiting review'};
}
function renderCoverage(entities){
  exportRows=entities.map(e=>{const p=publishedCoverage(e.entity_id);return {entity_id:e.entity_id,name:e.name,province:e.province,entity_type:e.entity_type,source_report_year:2024,publication_coverage:p.label,...Object.fromEntries(Object.entries(p).filter(([key])=>key!=='label'))};});
  return table([sortHeading('LGU','name'),'Report availability','Publication coverage','Published financial<br>records · all years','Published observations','Opinion','Prior status','Validation leads','Report'],entities.map(e=>{
    const c=coverage(e.entity_id),p=publishedCoverage(e.entity_id);
    const annual=Object.values(data.sources).find(s=>s.entity_id===e.entity_id&&s.kind==='annual_report');
    return `<tr><td>${placeHTML(e)}</td><td>${c.extraction_status==='no_report_in_local_scrape'?'<span class="badge warn">Not located</span>':annual?'<span class="badge">Available</span>':'<span class="missing">Pending</span>'}</td><td><span class="badge neutral">${escape(p.label)}</span></td><td class="number">${p.financials}</td><td class="number">${p.findings}</td><td>${opinion(e.entity_id)?'<span class="badge">Reviewed</span>':'<span class="missing">Pending</span>'}</td><td>${status(e.entity_id)?'<span class="badge">Reviewed</span>':'<span class="missing">Pending</span>'}</td><td class="number">${escape(c.validation_issues)}</td><td>${annual?citationHTML({source_id:annual.source_id,pdf_page:1}):'—'}</td></tr>`;
  }));
}
function renderSources(entities){
  const ids=new Set(entities.map(e=>e.entity_id));
  const sources=Object.values(data.sources).filter(s=>ids.has(s.entity_id)).sort((a,b)=>a.entity_name.localeCompare(b.entity_name)||a.kind.localeCompare(b.kind));
  exportRows=sources.map(s=>({LGU:s.entity_name,document_type:s.kind,archive_member:s.archive_member||'',pages:s.page_count,source_url:s.source_url,pdf:s.public_path||''}));
  return table(['LGU','Document','Pages','PDF','Original download'],sources.map(s=>{const url=safeURL(s.source_url);return `<tr><td>${placeHTML(entity(s.entity_id))}</td><td><span>${escape(s.kind.replaceAll('_',' '))}</span><span class="finding-topic">${escape(s.archive_member||'')}</span></td><td class="number">${s.page_count}</td><td>${s.public_path?citationHTML({source_id:s.source_id,pdf_page:1}):'<span class="missing">Inside original archive</span>'}</td><td>${url?`<a class="source-link" href="${escape(url)}" target="_blank" rel="noopener">COA ↗</a>`:'—'}</td></tr>`;}));
}
function renderCurrentView(){
  if(!data)return;
  const modes=state.indicator==='recommendations'?[['summary','Prior recommendation totals'],['followups','Individual follow-ups']]:state.indicator==='findings'?[['summary','Audit observations'],['notices','Audit notices']]:[];
  if(!modes.some(([id])=>id===state.dataset))state.dataset='summary';
  $('#records-label').hidden=!modes.length;
  $('#records-mode').innerHTML=modes.map(([id,label])=>`<option value="${id}">${label}</option>`).join('');$('#records-mode').value=state.dataset;
  const entities=selectedEntities(),ids=new Set(entities.map(e=>e.entity_id));
  if(!financialMetrics.includes(state.indicator))state.view='table';
  document.querySelectorAll('[data-indicator]').forEach(b=>b.setAttribute('aria-current',(b.dataset.indicator===state.indicator||(b.dataset.indicator==='overview'&&isFinancial()))?'page':'false'));
  $('#metric-label').hidden=!isFinancial();$('#metric').value=state.indicator;
  $('#clear-lgu').hidden=!state.lgu;$('#clear-lgu').textContent=state.lgu?`${entity(state.lgu)?.name||state.lgu} Ã—`:'';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
  $('[data-view=chart]').hidden=!financialMetrics.includes(state.indicator);
  $('#year').disabled=!isFinancial();$('#year').value=String(isFinancial()?state.year:2024);$('#topic-label').hidden=state.indicator!=='findings'||state.dataset==='notices';
  $('#title').textContent=labels[state.indicator];
  if(state.dataset==='followups')$('#title').textContent='Recommendation follow-ups';
  if(state.dataset==='notices')$('#title').textContent='Audit notices';
  $('#subtitle').textContent=`${state.area||'BARMM'} · ${state.level==='province'?'provincial governments':state.level==='local'?'cities & municipalities':'all governments'}${isFinancial()?` · financial year ${state.year}`:''}`;
  const f=data.financials.filter(r=>ids.has(r.entity_id)&&r.value!=null&&(isFinancial()?matchesFinancialYear(r,state.year):true));
  const o=data.opinions.filter(r=>ids.has(r.entity_id));
  const observations=data.findings.filter(r=>ids.has(r.entity_id)&&(!state.topic||findingTopics(r).includes(state.topic)));
  const metric=f.filter(r=>metricKey(r.metric,r.entity_id)===state.indicator);
  $('#summary').innerHTML=stat(entities.length,state.entityClass==='ministries'?'ministries / offices':'LGUs')+(financialMetrics.includes(state.indicator)?stat(new Set(metric.map(r=>r.entity_id)).size,state.entityClass==='ministries'?'offices with values':'LGUs with values')+stat(metric.length,'numeric source records'):stat(financialValueCount(ids),'financial values'))+stat(o.length,'reviewed opinions')+stat(state.topic&&state.indicator==='findings'?observations.length:countRecords(ids,'findings'),'reviewed observations');
  if(state.dataset!=='summary'){
    const rows=(data[state.dataset==='followups'?'recommendation_followups':'notices']||[]).filter(r=>ids.has(r.entity_id));
    $('#summary').innerHTML=stat(entities.length,'LGUs')+stat(rows.length,state.dataset==='followups'?'reviewed follow-up rows':'reviewed notice records')+stat(new Set(rows.map(r=>r.entity_id)).size,state.entityClass==='ministries'?'offices with reviewed rows':'LGUs with reviewed rows');
  }
  let note='Source report year: 2024. Published records are a partial independently reviewed subset; missing records are not zero. Provincial accounts are separate from city and municipal accounts.';
  if(isFinancial())note+=' Signs and fund scopes follow the source records.';
  if(state.indicator==='findings')note='Reviewed observations only; coverage is incomplete. Amounts retain their source context and must not be added as money lost. Open an observation for its recommendation and evidence.';
  if(state.indicator==='findings'&&state.lgu){const c=coverage(state.lgu);note+=c?.extraction_status==='no_report_in_local_scrape'?` The 2024 annual report has not been located for ${entity(state.lgu).name}.`:` ${data.findings.filter(r=>r.entity_id===state.lgu).length} published observations for ${entity(state.lgu).name}; whole-report completeness is not certified.`;}
  if(state.indicator==='recommendations')note='Prior-year recommendations reported in the 2024 audit. Missing implementation categories are not inferred from the total.';
  if(state.indicator==='coverage')note='Source report year: 2024. Counts describe the currently published reviewed subset across available financial years, not whole-report completion. Validation leads may reflect OCR, extraction errors or source discrepancies. Open an LGU for its review notes.';
  if(state.indicator==='sources')note='Original COA documents, including annexes and errata. A document being available does not mean its contents have been verified.';
  if(state.dataset==='followups')note='Reviewed recommendation rows. Agency status and COA validation are separate; follow-up dates may be later than the audit year.';
  if(state.dataset==='notices')note='Reviewed notice records. Opening balances, issued amounts, settlements and closing balances remain separate. Unreported amounts are not zero.';
  if(isFinancial()&&state.year!==2024)note+=` ${state.year} values are comparative or historical figures printed in the 2024 source reports, not separately processed earlier-year reports.`;
  $('#data-note').textContent=note;
  const renderers={overview:renderOverview,opinions:renderOpinions,recommendations:renderRecommendations,findings:renderFindings,coverage:renderCoverage,sources:renderSources};
  $('#results').innerHTML=(renderers[state.indicator]||renderFinancial)(entities)+`<div class="table-footer"><span>${exportRows.length} table rows · ${entities.length} LGUs</span><span>COA · 2024 annual audit reports</span></div>`;
  $('#export').disabled=!exportRows.length;
  const url=new URL(location.href);url.search='';
  for(const key of ['indicator','level','year','view'])url.searchParams.set(key,state[key]);
  if(state.entityClass==='ministries')url.searchParams.set('entity_class','ministries');
  if(state.area)url.searchParams.set('area',state.area);if(state.lgu)url.searchParams.set('lgu',state.lgu);
  if(state.search)url.searchParams.set('search',state.search);if(state.topic&&state.indicator==='findings')url.searchParams.set('topic',state.topic);
  if(state.dataset!=='summary')url.searchParams.set('dataset',state.dataset);
  history.replaceState(null,'',url);
}
function showDetail(title,kicker,html){if(!$('#detail').open)detailOpener=document.activeElement;$('#detail-title').textContent=title;$('#detail-kicker').textContent=kicker;$('#detail-body').innerHTML=html;$('#detail-body').parentElement.scrollTop=0;if(!$('#detail').open)$('#detail').showModal();}
function recordIssuesHTML(r){const asList=v=>v==null?[]:Array.isArray(v)?v:[v];const notes=[...new Map([...asList(r.issues),...asList(r.source_issues),...asList(r.source_issue),...asList(r.source_limitations),...asList(r.source_scope_qualification),...asList(r.source_date_label_limitation?{detail:r.source_date_label_limitation,citations:[r.source_year_citation].filter(Boolean)}:null),...asList(r.source_unit_basis?{detail:r.source_unit_basis,citations:[r.source_unit_citation].filter(Boolean)}:null),...asList(r.source_fund_scope_qualification?{detail:r.source_fund_scope_qualification,citations:[r.fund_citation,r.source_fund_scope_continuation_citation,r.source_fund_scope_cross_reference_citation].filter(Boolean)}:null),...asList(r.unit_assignment?{detail:contextText(r.unit_assignment),citations:[r.source_unit_citation,r.source_currency_glyph_citation].filter(Boolean)}:null)].map(note=>[JSON.stringify(note),note])).values()];return notes.length?`<h3>Source notes</h3><ul class="issue-list">${notes.map(note=>`<li>${escape(typeof note==='string'?note:note.detail||note.description||note.summary||note.reason||JSON.stringify(note))}${typeof note==='object'?[note.citation,...(note.citations||[])].filter(Boolean).map(citationHTML).join(''):''}</li>`).join('')}</ul>`:'';}
function financialFieldEvidence(r){
  const collect=value=>Array.isArray(value)?value.flatMap(collect):value&&typeof value==='object'?(value.source_id&&value.pdf_page?[value]:Object.values(value).flatMap(collect)):[];
  const rows=Object.entries(r).filter(([key])=>(key.endsWith('_citation')||key.endsWith('_citations'))&&!['continuation_citations','equivalent_source_citations'].includes(key)).map(([key,value])=>({key,citations:[...new Map(collect(value).map(c=>[JSON.stringify(c),c])).values()]})).filter(row=>row.citations.length);
  return rows.length?`<details class="field-evidence"><summary>Field source evidence</summary>${rows.map(row=>`<h4>${escape(row.key.replace(/^source_/, '').replace(/_citations?$/, '').replaceAll('_',' '))}</h4>${row.citations.map(sourceActions).join('')}`).join('')}</details>`:'';
}
function financialDetail(r){
  const raw=r.source_cell_as_printed??r.value_as_printed??r.source_cell??((r.source_cell_state||r.cell_state)==='blank'?'':null);
  return `<div class="detail-value ${r.value<0?'negative':''}">${financialValue(r)} <small style="font-size:13px">${escape(r.unit)}</small></div><dl class="metadata"><dt>Financial year</dt><dd>${r.year??'Not assigned; see source row and column'}</dd>${r.year_inferred?`<dt>Printed year heading</dt><dd>${escape(r.source_period_label)}</dd><dt>Year interpretation</dt><dd>${escape(r.year_assignment_basis)} ${citationHTML(r.year_context_citation)}</dd>`:''}<dt>Report year</dt><dd>${r.report_year}</dd>${r.unit_basis?`<dt>Currency qualification</dt><dd>${escape(r.unit_basis)}${r.unit_citation?` ${citationHTML(r.unit_citation)}`:''}</dd>`:''}<dt>Fund / scope</dt><dd>${escape(r.fund_scope)}${r.scope_citation?` ${citationHTML(r.scope_citation)}`:''}</dd>${r.source_table?`<dt>Source table</dt><dd>${escape(r.source_table)}</dd>`:''}${r.source_context?`<dt>Row context</dt><dd>${escape(contextText(r.source_context))}</dd>`:''}${(r.source_column_label||r.source_column)?`<dt>Source column</dt><dd>${escape(r.source_column_label||r.source_column)}</dd>`:''}${r.note_reference_cell_state&&r.note_reference_cell_state!=='not_applicable'?`<dt>Note reference</dt><dd>${r.source_note_reference==null?'Blank (no reference printed)':escape(r.source_note_reference)}${r.note_reference_citation?` ${citationHTML(r.note_reference_citation)}`:''}</dd>`:''}<dt>Source row</dt><dd>${escape(r.source_label)}</dd>${r.budget_column?`<dt>Budget column</dt><dd>${escape(budgetColumnLabels[r.budget_column]||r.budget_column)}</dd>`:''}${raw!=null?`<dt>Printed cell</dt><dd>${raw===''?'Blank':escape(raw)}</dd>`:''}<dt>Review</dt><dd>Verified transcription${r.status==='conflicting'?' · source conflict':''}</dd></dl>${sourceActions(r.citation)}${(r.continuation_citations||[]).map(sourceActions).join('')}${(r.equivalent_source_citations||[]).map(sourceActions).join('')}${recordIssuesHTML(r)}${financialFieldEvidence(r)}`;
}
function issueHTML(id){const rows=issues(id);return rows.length?`<h3>Source & review notes</h3><ul class="issue-list">${rows.map(r=>`<li>${escape(typeof r==='string'?r:r.detail||r.description||JSON.stringify(r))}</li>`).join('')}</ul>`:'';}
function openFinancial(id,metric){
  const rs=records(id,metric);
  showDetail(labels[metric],`${entity(id).name} · ${state.year}`,rs.length?`${rs.length>1?'<p class="detail-note">Multiple source records. Keep their scopes and source differences separate.</p>':''}${rs.map(financialDetail).join('<hr>')}${issueHTML(id)}`:'<p class="detail-note">No current independently reviewed record is available for this metric and year.</p>');
}
function reportSectionsHTML(r){
  const sourceSections=r.report_sections||[];
  const sections=Array.isArray(sourceSections)?sourceSections:Object.entries(sourceSections).map(([key,section])=>({...section,title:section.title||key.replaceAll('_',' ')}));
  const signersHTML=signers=>(signers||[]).map(signer=>`<h3>${escape(signer.name_as_printed||signer.printed_name||signer.name||'')}</h3><p style="white-space:pre-wrap">${escape(signer.titles_as_printed||signer.title_as_printed||signer.printed_role||signer.role||'')}</p>${(signer.date_as_printed||signer.printed_date)?`<p>${escape(signer.date_as_printed||signer.printed_date)}</p>`:''}${(signer.citations||[signer.citation,signer.name_role_citation,signer.date_citation].filter(Boolean)).map(sourceActions).join('')}`).join('');
  return sections.map(section=>`<h3>${escape(section.title)}</h3><p style="white-space:pre-wrap">${escape(section.full_text)}</p>${(section.citations||(section.citation?[section.citation]:(r.source_segments||[]).filter(segment=>section.source_pages?.includes(segment.citation?.pdf_page)).map(segment=>segment.citation))).map(sourceActions).join('')}${signersHTML(section.signatories)}`).join('')+signersHTML(r.report_signatories||r.signatories);
}
function rawSourceGridsHTML(grids,segments=[]){
  return (grids||[]).map(grid=>{
    const citation=segments.find(segment=>segment.citation?.pdf_page===grid.source_page)?.citation;
    return `<details class="source-grid"><summary>Source table · page ${escape(grid.source_page)}</summary>${grid.source_cell_null_semantics?`<p class="detail-note">${escape(grid.source_cell_null_semantics)}</p>`:''}<div style="overflow-x:auto"><table class="compact-table"><tbody>${(grid.rows||[]).map(row=>`<tr>${row.map(cell=>`<td style="white-space:pre-wrap">${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${citation?sourceActions(citation):''}</details>`;
  }).join('');
}
function openOpinion(id){const r=opinion(id);showDetail('Audit opinion',`${entity(id).name} · 2024`,r?`${badge(r.classification)}<h3>Source wording</h3><p>${escape(r.source_wording)}</p>${r.basis?`<h3>Basis</h3><p>${escape(r.basis)}</p>${(r.basis_citations||[]).map(sourceActions).join('')}`:''}${r.key_audit_matters?`<h3>Key audit matters</h3><p>${escape(r.key_audit_matters)}</p>${r.key_audit_matters_citation?sourceActions(r.key_audit_matters_citation):''}`:''}${reportSectionsHTML(r)}${sourceActions(r.citation)}${recordIssuesHTML(r)}${issueHTML(id)}`:'<p class="detail-note">Audit opinion pending independent review.</p>');}
function openStatus(id){const r=status(id);showDetail('Prior recommendations',`${entity(id).name} · 2024`,r?`<dl class="metadata">${[['total','Total'],['fully_implemented','Fully implemented'],['partially_implemented','Partially implemented'],['not_implemented','Not implemented']].map(([k,l])=>`<dt>${l}</dt><dd>${r[k]==null?'Not reported':integer.format(r[k])}</dd>`).join('')}<dt>As of</dt><dd>${escape(r.as_of)}</dd></dl>${sourceActions(r.citation)}${recordIssuesHTML(r)}${issueHTML(id)}`:'<p class="detail-note">Prior-recommendation status pending independent review.</p>');}
function openFinding(index){const r=data.findings[index];showDetail(`Observation ${r.source_number}`,`${r.entity_name} · 2024`, `<h3>${escape(r.title)}</h3><p>${escape(r.summary)}</p><p class="finding-topic">${escape(findingTopics(r).join(' · '))}</p><details><summary>Original topic tags</summary><p>${escape((r.topics||[]).join(' · '))}</p></details>${(r.amounts||[]).length?'<h3>Amounts in source</h3>'+r.amounts.map(a=>`<p><strong>${a.unit==='count'?integer.format(a.value):money(a.value)} ${escape(a.unit)}</strong><br>${escape(a.meaning)}</p>${sourceActions(a.citation||r.citation)}`).join(''):''}${(r.source_narrative||r.full_observation_text)?`<details class="detail-finding"><summary>Full observation text</summary><p style="white-space:pre-wrap">${escape(r.source_narrative||r.full_observation_text)}</p>${[...(r.source_narrative_citations||[]),...(r.source_segments||[]).map(segment=>segment.citation)].filter(Boolean).map(sourceActions).join('')}</details>`:''}${r.repeated_explicitly===true?`<h3>Prior recommendation reiterated</h3><p>${escape(r.repeated_explicitly_scope||"The report explicitly reiterates an earlier recommendation.")}</p>${(r.repeated_explicitly_citations||[]).map(sourceActions).join('')}`:''}${supportingSchedulesHTML(r)}${rawSourceGridsHTML(r.supporting_schedule_grids,r.source_segments)}<p><a href="${assetPath('findings.jsonl')}" download>Download reviewed audit observations</a></p><h3>Recommendation</h3><p>${escape(r.recommendation||'No recommendation recorded')}</p>${r.recommendation_citation?sourceActions(r.recommendation_citation):''}${r.recommendation_continuation_citation?sourceActions(r.recommendation_continuation_citation):''}${(r.recommendation_citations||[]).map(sourceActions).join('')}${(r.continuation_citations||[]).map(sourceActions).join('')}<h3>Management response</h3><p>${escape(r.management_response||'No response recorded')}</p>${r.management_response_citation?sourceActions(r.management_response_citation):''}${r.management_response_continuation_citation?sourceActions(r.management_response_continuation_citation):''}${(r.management_response_citations||[]).map(sourceActions).join('')}<h3>Source evidence</h3>${sourceActions(r.citation)}${recordIssuesHTML(r)}`);}
function disclosuresHTML(id){
  const rows=(data.financial_note_disclosures||[]).filter(r=>r.entity_id===id);
  if(!rows.length)return '';
  return `<h3>Financial statement notes</h3>${rows.map(r=>`<details class="detail-finding"><summary>${escape(r.title||r.source_label||r.topic)}</summary>${r.source_context?`<p class="finding-topic">${escape(contextText(r.source_context))}</p>`:''}<p>${escape(r.full_text||r.text||r.summary||'')}</p>${sourceActions(r.citation)}${(r.continuation_citations||[]).map(sourceActions).join('')}${recordIssuesHTML(r)}</details>`).join('')}<p><a href="${assetPath('financial_note_disclosures.jsonl')}" download>Download reviewed financial statement notes</a></p>`;
}
function sourceContextHTML(id){
  const rows=(data.source_document_context||[]).filter(r=>r.entity_id===id);
  if(!rows.length)return '';
  const layout=r=>{
    const regional=(r.source_layout_regions||[]).flatMap((region,index)=>(region.raw_layout_intersections||[]).map(cell=>({...cell,printed_heading:region.printed_heading??region.printed_label,heading_occurrence_index:index,source_column_heading:cell.source_column_heading??cell.printed_column_literal,source_column_year:cell.source_column_year??cell.source_year??cell.source_year_leaf})));
    const cells=r.raw_layout_intersections?.length?r.raw_layout_intersections:regional.length?regional:(r.source_column_intersections||[]).map(cell=>({printed_heading:r.citation?.excerpt||'',source_column_heading:cell.fund_column_label??cell.source_column??'',source_column_year:cell.year_column??cell.year,raw_text:cell.literal??cell.raw,cell_state:cell.observed_state}));
    return cells.length?`<details class="source-layout"><summary>Source layout cells</summary><p class="detail-note">Blank and hyphen cells belong to the printed layout; no financial amount is assigned.</p>${table(['Source heading','Source column','Year','Printed cell','Source state'],cells.map(cell=>`<tr><td>${escape(cell.printed_heading??(cell.heading_occurrence_index==null?'':cell.heading_occurrence_index+1))}</td><td>${escape(cell.source_column_heading??'')}</td><td>${cell.source_column_year??''}</td><td>${escape(cell.raw_text??'')}</td><td>${escape(cell.cell_state)}</td></tr>`))}</details>`:'';
  };
  const contextEvidence=r=>{
    const found=[];const collect=v=>{if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object'){if(v.source_id&&v.pdf_page)found.push(v);else Object.values(v).forEach(collect);}};collect(r);
    return [...new Map(found.map(c=>[JSON.stringify(c),c])).values()].map(sourceActions).join('');
  };
  const contextMeaning=r=>`${r.interpretation?`<p class="detail-note source-interpretation">${escape(r.interpretation)}</p>`:''}${r.source_conflict?`<h4>Source discrepancy</h4><dl class="metadata source-conflict">${Object.entries(r.source_conflict).filter(([key,v])=>key!=='status'&&v!=null&&typeof v!=='object').map(([key,v])=>`<dt>${escape(key.replaceAll('_',' '))}</dt><dd>${escape(v)}</dd>`).join('')}</dl>`:''}`;
  const sourceSchedules=r=>{
    const fieldLabels={reference:'Reference',observation:'Audit observation',recommendation:'Audit recommendation',action_plan:'Action plan',responsible_office:'Responsible office',target_start:'Target start',target_end:'Target end',agency_status:'Status as printed',reasons:'Reasons',action_taken:'Action taken'};
    const logical=r.aapsi_rows?.map(row=>({number:row.source_number,fields:row.fields}))||r.partiii_recommendation_rows?.map(row=>({number:row.source_number,fields:{reference:row.reference_as_printed,observation:row.observation_as_printed,recommendation:row.recommendation_as_printed,agency_status:row.status_as_printed}}))||[];
    const schedules=logical.length?'<h4>Recommendations as printed</h4>'+logical.map(row=>'<details class="source-schedule"><summary>Source recommendation '+escape(row.number)+'</summary><dl class="metadata">'+Object.entries(row.fields).map(([key,value])=>'<dt>'+escape(fieldLabels[key]||key)+'</dt><dd style="white-space:pre-wrap">'+(value==null||value===''?'<span class="missing">Blank in source</span>':escape(value))+'</dd>').join('')+'</dl></details>').join(''):'';
    const blank=r.raw_template_grid?.blank_cells||[];
    const template=blank.length?'<details class="source-template"><summary>Unfilled source template · '+blank.length+' blank cells</summary><p class="detail-note">These fields are blank in the printed template. No recommendation, implementation status or zero is assigned.</p>'+table(['Source row','Field','Printed cell','Source state'],blank.map(cell=>'<tr><td>'+escape(cell.source_row)+'</td><td>'+escape(fieldLabels[cell.role]||cell.role)+'</td><td></td><td>'+escape(cell.source_cell_state)+'</td></tr>'))+'</details>':'';
    const qualifications=r.source_qualifications?.length?'<details class="source-qualifications"><summary>Source qualifications and discrepancies</summary><ul>'+r.source_qualifications.map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul></details>':'';
    const inventory=(r.source_row_inventory||[]).filter(row=>Array.isArray(row.source_cells));
    const funds=inventory[0]?.source_cells||[];
    const financialTable=inventory.length?'<details class="source-account-table"><summary>Account rows and fund columns as printed</summary><p class="detail-note">Amounts, dashes and blank cells retain their source meanings. Keep fund columns separate.</p>'+table(['Source row',...funds.map(cell=>cell.source_column||cell.fund_scope)],inventory.map(row=>'<tr><td>'+escape(row.source_label)+'</td>'+row.source_cells.map(cell=>'<td style="white-space:pre-wrap">'+(cell.state==='blank'?'<span class="missing">Blank</span>':escape(cell.raw??''))+'<span class="finding-topic">'+escape(cell.state)+'</span>'+(cell.citation?citationHTML(cell.citation):'')+'</td>').join('')+'</tr>'))+'</details>':'';
    const headings=(r.structural_heading_intersections||[]).filter(row=>Array.isArray(row.source_cells));
    const structural=headings.length?'<details class="source-account-headings"><summary>Statement headings and unfilled intersections</summary><p class="detail-note">These are headings in the statement. Their unfilled intersections are not financial amounts.</p>'+table(['Source heading','Fund column','Printed cell','Source state'],headings.flatMap(row=>row.source_cells.map(cell=>'<tr><td>'+escape(row.source_label)+'</td><td>'+escape(cell.source_column||funds.find(fund=>fund.fund_scope===cell.fund_scope)?.source_column||cell.fund_scope.replaceAll('_',' '))+'</td><td>'+escape(cell.raw??'')+'</td><td>'+escape(cell.state.replaceAll('_',' '))+'</td></tr>')) )+'</details>':'';

    const historical=(r.historical_recommendation_rows||[]).map(row=>'<details class="source-history-row"><summary>Historical source recommendation '+escape(row.historical_recommendation_number)+'</summary><dl class="metadata">'+row.source_cells.map(cell=>'<dt>'+escape(cell.column_role.replaceAll('_',' '))+'</dt><dd class="source-history-cell" data-source-state="'+escape(cell.source_cell_state)+'" style="white-space:pre-wrap">'+(cell.source_cell_text==null||cell.source_cell_text===''?'<span class="missing">Blank in source</span>':escape(cell.source_cell_text))+'<span class="finding-topic">'+escape(cell.source_cell_state.replaceAll('_',' '))+'</span>'+(cell.shared_owner_recommendation_numbers?.length>1?'<span class="finding-topic">Shared printed cell: recommendations '+escape(cell.shared_owner_recommendation_numbers.join(', '))+'</span>':'')+(cell.citation?citationHTML(cell.citation):'')+'</dd>').join('')+'</dl></details>').join('');
    const navigation=r.source_navigation_rows?.length?'<details class="source-navigation"><summary>Contents references as printed</summary>'+table(['Part','Source description','Page reference','Source state'],r.source_navigation_rows.map(row=>'<tr><td>'+escape(row.part_as_printed||'')+'</td><td>'+escape(row.source_label)+'</td><td>'+escape(row.printed_page_reference||'')+'</td><td>'+escape(row.page_reference_state)+'</td></tr>'))+'</details>':'';
    const highlightRows=(r.financial_highlight_rows||[]).filter(row=>Array.isArray(row.source_cells));
    const highlights=highlightRows.length?'<details class="source-highlights"><summary>Executive summary figures as printed</summary>'+table(highlightRows[0].source_cells.map(cell=>cell.printed_column),highlightRows.map(row=>'<tr>'+row.source_cells.map(cell=>'<td class="source-highlight-cell">'+escape(cell.source_cell_text??'')+(cell.citation?citationHTML(cell.citation):'')+'</td>').join('')+'</tr>'))+'</details>':'';
    const graphics=[...(r.source_graphics||[]),...(r.source_graphic_visual_evidence||[]),...(r.source_signature_visual_evidence||[]),...(r.graphic_visual_evidence?[r.graphic_visual_evidence]:[]),...(r.signature_graphic_evidence?[r.signature_graphic_evidence]:[])];
    const graphicDetails=graphics.length?'<details class="source-graphics"><summary>Source graphics and legibility</summary>'+graphics.map(g=>'<dl class="metadata">'+['classification','central_visual_elements','identity_qualification','handwritten_identity','source_glyph_review_issue'].filter(key=>typeof g[key]==='string').map(key=>'<dt>'+escape(key.replaceAll('_',' '))+'</dt><dd>'+escape(g[key].replaceAll('_',' '))+'</dd>').join('')+'</dl>').join('')+'</details>':'';
    const conflicts=[...(r.source_navigation_conflicts||[]),...(r.literal_source_conflicts||[])];
    const conflictDetails=conflicts.length?'<details class="source-literal-conflicts"><summary>Literal source discrepancies</summary><ul>'+conflicts.map(v=>'<li>'+escape(typeof v==='string'?v:Object.values(v).filter(x=>typeof x==='string').join(' · '))+'</li>').join('')+'</ul></details>':'';
    return schedules+historical+navigation+highlights+graphicDetails+conflictDetails+template+financialTable+structural+qualifications;
  };
  const structure=r=>`${!r.structured_rows?.length&&r.glossary_entries?.length?`<div class="source-glossary">${table(['Abbreviation','Source expansion','Source'],r.glossary_entries.map(row=>`<tr><td>${escape(row.abbreviation)}</td><td>${escape(row.source_expansion)}</td><td>${citationHTML(row.citation)}</td></tr>`))}</div>`:''}${r.raw_source_grid?.rows?.length?rawSourceGridsHTML([{...r.raw_source_grid,source_page:r.citation.pdf_page,source_cell_null_semantics:r.blank_template_rows?.length?'Blank rows are uncompleted fields in the source template.':r.raw_source_grid.source_cell_null_semantics}],[{citation:r.citation}]):''}`;
  return `<h3>Supporting source material</h3>${rows.map(r=>`<details class="detail-finding source-context"><summary>${escape(r.title)}</summary><p class="finding-topic">${escape(r.source_document)} · ${escape(r.source_scope)}</p><p class="source-context-text" style="white-space:pre-wrap">${escape(r.full_text)}</p>${r.structured_rows?.length?table(['Term','Definition','Source'],r.structured_rows.map(row=>`<tr><td>${escape(row.term)}</td><td>${escape(row.definition)}</td><td>${citationHTML(row.citation)}</td></tr>`)):''}${structure(r)}${sourceSchedules(r)}${layout(r)}${contextMeaning(r)}${contextEvidence(r)}${recordIssuesHTML(r)}</details>`).join('')}<p><a href="${assetPath('source_document_context.jsonl')}" download>Download reviewed supporting source material</a></p>`;
}
function openEntity(id){
  const e=entity(id),c=coverage(id),p=publishedCoverage(id),o=opinion(id),s=status(id),rs=data.financials.filter(r=>r.entity_id===id&&matchesFinancialYear(r,state.year)),fs=data.findings.filter(r=>r.entity_id===id);
  showDetail(e.name,`${e.entity_type==='Province'?'Provincial government':e.entity_type} · 2024 report`,`<p>${escape(p.label)} · ${p.findings} published observations · ${p.financials} published financial records across available years. Whole-report completeness is not certified.</p><h3>Financial year ${state.year}</h3>${rs.length?`<table class="compact-table"><thead><tr><th>Metric</th><th>Value</th><th>Source</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${escape(r.source_label||labels[r.metric]||r.metric)}<span class="finding-topic">${escape(r.fund_scope)}</span></td><td class="number"><button class="record" data-record="${data.financials.indexOf(r)}">${financialValue(r)}</button></td><td>${citationHTML(r.citation)}</td></tr>`).join('')}</tbody></table>`:'<p class="missing">Financial records pending review.</p>'}<h3>Audit opinion</h3><button class="record" data-opinion="${id}">${badge(o?.classification)}</button><h3>Prior recommendations</h3>${s?`<button class="record" data-status="${id}">${s.total==null?'Total not reported':`${s.total} prior recommendations`} · source & status</button>`:'<p class="missing">Pending review</p>'}<h3>Reviewed observations</h3>${fs.length?fs.map(r=>`<div class="detail-finding"><button class="record" data-finding="${data.findings.indexOf(r)}">${escape(r.source_number)}. ${escape(r.title)}</button></div>`).join(''):'<p class="missing">No independently reviewed observations available.</p>'}${disclosuresHTML(id)}${sourceContextHTML(id)}${issueHTML(id)}`);
}
function scheduleValue(value){
  if(value==null)return '<span class="missing">Unavailable</span>';
  if(typeof value==='number')return money(value);
  if(typeof value==='object'&&Object.hasOwn(value,'value'))return `${scheduleValue(value.value)}${value.unit?` ${escape(value.unit)}`:''}`;
  return escape(value);
}
  function supportingSchedulesHTML(record){
    const heading=key=>key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
    const sharedLabelCellsHTML=schedule=>{
      if(!schedule.merged_report_name_ownership||!schedule.source_rows_as_printed?.length)return '';
      const rows=schedule.source_rows_as_printed;
      const columns=[...new Set(rows.flatMap(row=>Object.keys(row.cells||{})))];
      return `<details class="schedule-source-cells"><summary>Printed cells and shared report labels</summary><p class="detail-note">Each monthly row uses the report label printed for its group. A label may continue on the next page; the source fragments below show that shared label. Report-and-month row labels are joined for display.</p>${table(['Report and month',...columns.map(escape)],rows.map(row=>`<tr><td>${escape(row.row_label||'')}</td>${columns.map(column=>{const cell=row.cells?.[column];if(!cell)return '<td>Unavailable</td>';const literal=cell.raw_text??cell.source_cell_as_printed??cell.value;const evidence=[cell.citation,...(cell.citations||[])].filter(Boolean);return `<td>${escape(cell.cell_state==='blank'?'Blank':literal??'Unavailable')}${evidence.map(sourceActions).join('')}</td>`;}).join('')}</tr>`))}</details>`;
    };
    const issueHTML=issue=>issue?`<p class="detail-note">${escape(typeof issue==='object'?issue.detail:issue)}</p>${typeof issue==='object'?Object.entries(issue).filter(([key])=>key.endsWith('citation')).map(([,citation])=>citationHTML(citation)).join(''):''}`:'';
  const rowsHTML=(rows,columnLabels={},columnHeaders=[])=>{
    if(!rows?.length)return '';
    if(rows.every(row=>Array.isArray(row.cells))){
      const columns=[...new Set(rows.flatMap(row=>row.cells.map(cell=>cell.column)))];
      const normalized=value=>String(value??'').replace(/\s+/g,' ').trim();
      const includeRowLabel=!rows.every(row=>row.cells.some(cell=>normalized(cell.source_cell_as_printed??cell.value)===normalized(row.source_row_label)));
      const headerOffset=columnHeaders.length===columns.length+1?1:0;
      const rowHeading=headerOffset?columnHeaders[0]:'Source row';
      const headings=columns.map((column,i)=>columnHeaders[i+headerOffset]||column);
      return table([...(includeRowLabel?[escape(rowHeading)]:[]),...headings.map(escape),'Source'],rows.map(row=>`<tr>${includeRowLabel?`<td>${escape(row.source_row_label||'')}</td>`:''}${columns.map(column=>{const cell=row.cells.find(cell=>cell.column===column);return `<td>${cell?escape(cell.cell_state==='blank'?'Blank':cell.source_cell_as_printed??cell.value??'Unavailable'):'<span class="missing">Unavailable</span>'}${cell?.citation?citationHTML(cell.citation):''}</td>`;}).join('')}<td>${citationHTML(row.citation)}</td></tr>`));
    }
    rows=rows.map(row=>{const {cells,...fields}=row;return cells&&typeof cells==='object'&&!Array.isArray(cells)?{...fields,...cells}:row;});
    const annotations=rows.filter(row=>row.source_classification==='source_annotation_in_brs_due_date_cell');
    rows=rows.filter(row=>row.source_classification!=='source_annotation_in_brs_due_date_cell');
    const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))].filter(key=>!['citation','unit','source_issue','source_issues','issues','source_field_citations','source_classification','source_row_identity','publication_disposition'].includes(key)&&rows.some(row=>row[key]!=null));
      return table([...columns.map(key=>escape(columnLabels[key]||heading(key))),'Source'],rows.map(row=>`<tr>${columns.map(key=>`<td>${scheduleValue(row[key])}${row.source_field_citations?.[key]?citationHTML(row.source_field_citations[key]):''}</td>`).join('')}<td>${citationHTML(row.citation)}</td></tr>`))+annotations.map(row=>`<p class="schedule-annotation"><strong>BRS due-date annotation</strong><br>${escape(row.col_2||'')}</p>${citationHTML(row.citation)}`).join('')+rows.filter(row=>row.source_issue).map(row=>`<h4>${escape(row.asset_class||row.project||row.report||row.agency||'Source note')}</h4>${issueHTML(row.source_issue)}`).join('');
  };
  return (record.supporting_schedules||[]).map(schedule=>`<h3>${escape(schedule.schedule||schedule.title)}</h3>${schedule.period?`<p class="finding-topic">${escape(schedule.period)}</p>`:''}${schedule.derived_from_narrative?'<p class="detail-note">Structured from the report narrative.</p>':''}${rowsHTML(schedule.rows,schedule.column_labels,schedule.column_headers)}${sharedLabelCellsHTML(schedule)}${schedule.table_i_deadlines?`<h4>Prescribed submission dates</h4>${rowsHTML(schedule.table_i_deadlines)}`:''}${schedule.table_ii_batches?`<h4>Submission of reports</h4>${rowsHTML(schedule.table_ii_batches)}`:''}${schedule.total?`<h4>Total</h4>${Object.hasOwn(schedule.total,'value')?`<p>${scheduleValue(schedule.total)}</p>${citationHTML(schedule.total_citation)}`:rowsHTML([{...schedule.total,agency:'Total'}])}`:''}${schedule.total_as_printed?`<p><strong>Total as printed</strong><br>${escape(schedule.total_as_printed)}</p>${citationHTML(schedule.total_citation)}`:''}${recordIssuesHTML(schedule)}`).join('');
}
function closeMenu(){document.body.classList.remove('menu-open');$('#scrim').hidden=true;$('#menu').setAttribute('aria-expanded','false');}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b||!data)return;
  if(b.dataset.indicator){state.indicator=b.dataset.indicator;state.dataset='summary';state.lgu='';state.sort='name';state.direction=1;state.view='table';closeMenu();render();}
  else if(b.dataset.view){state.view=b.dataset.view;render();}
  else if(b.dataset.sort){state.direction=state.sort===b.dataset.sort?-state.direction:1;state.sort=b.dataset.sort;render();}
  else if(b.dataset.observations){state.lgu=b.dataset.observations;state.indicator='findings';state.dataset='summary';state.topic='';$('#topic').value='';state.search='';$('#search').value='';state.view='table';render();}
  else if(b.dataset.entity)openEntity(b.dataset.entity);
  else if(b.dataset.financial)openFinancial(b.dataset.financial,b.dataset.metric);
  else if(b.dataset.record!==undefined){const r=await ensureRecord('financials',Number(b.dataset.record));showDetail(r.source_label||labels[r.metric]||r.metric,`${r.entity_name} · ${r.year??'Report '+r.report_year}`,financialDetail(r)+issueHTML(r.entity_id));}
  else if(b.dataset.opinion)openOpinion(b.dataset.opinion);
  else if(b.dataset.status)openStatus(b.dataset.status);
  else if(b.dataset.finding!==undefined)openFinding(Number(b.dataset.finding));
  else if(b.dataset.followup!==undefined)openAnnex('recommendation_followups',Number(b.dataset.followup));
  else if(b.dataset.notice!==undefined)openAnnex('notices',Number(b.dataset.notice));
});
$('#level').addEventListener('change',()=>{state.level=$('#level').value;state.lgu='';render();});
$('#area').addEventListener('change',()=>{state.area=$('#area').value;state.lgu='';render();});
$('#metric').addEventListener('change',()=>{state.indicator=$('#metric').value;state.sort='name';state.view='table';render();});
$('#clear-lgu').addEventListener('click',()=>{state.lgu='';render();});
$('#year').addEventListener('change',()=>{state.year=Number($('#year').value);render();});
$('#search').addEventListener('input',()=>{state.search=$('#search').value;render();});
$('#topic').addEventListener('change',()=>{state.topic=$('#topic').value;render();});
$('#records-mode').addEventListener('change',()=>{state.dataset=$('#records-mode').value;render();});
$('#close-detail').addEventListener('click',()=>{detailSequence++;$('#detail').close();});
$('#detail').addEventListener('close',()=>{if(detailOpener?.isConnected)detailOpener.focus();});
$('#detail').addEventListener('click',event=>{if(event.target===$('#detail')){const bounds=$('#detail').getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)$('#detail').close();}});
$('#menu').addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');document.body.classList.toggle('menu-open',open);$('#scrim').hidden=!open;$('#menu').setAttribute('aria-expanded',String(open));});
$('#scrim').addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
$('#export').addEventListener('click',async()=>{
  if(!exportRows.length)return;
  try{await prepareExport();}catch(error){$('#error').textContent=error.message;$('#error').hidden=false;return;}
  const keys=[...new Set(exportRows.flatMap(Object.keys))];
  const cell=value=>{let s=String(value??'');if(typeof value!=='number'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const csv='\uFEFF'+[keys.map(cell).join(','),...exportRows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`coa-barmm-${state.dataset==='summary'?state.indicator:state.dataset}-${state.level}-${isFinancial()?state.year:2024}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function unpackBrowserData(payload){
  if(payload.format!=='coa-interned-strings-v1')return payload;
  const strings=payload.strings;
  function restore(value){
    if(!value||typeof value!=='object')return value;
    if(!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'$coaText')){
      const index=value.$coaText;
      if(!Number.isInteger(index)||index<0||index>=strings.length)throw Error('Invalid COA source text reference');
      return strings[index];
    }
    for(const key of Object.keys(value))value[key]=restore(value[key]);
    return value;
  }
  return restore(payload.data);
}

const viewCache=new Map(),recordCache=new Map();
let renderSequence=0,catalogLoaded=false,detailSequence=0,initSequence=0,initialSetup=true;
async function apiJSON(path){return staticCoaJSON(state.entityClass,path);}
function findingTopics(record){return record.topic_groups||[...new Set((record.topics||[]).map(t=>data.topic_aliases?.[t]||t))].sort();}
function countRecords(ids,category){return [...ids].reduce((n,id)=>n+(data.record_counts[id]?.[category]||0),0);}
function financialValueCount(ids){const counts=isFinancial()?data.numeric_financial_counts_by_year[String(state.year)]||{}:data.numeric_financial_counts;return [...ids].reduce((n,id)=>n+(counts[id]||0),0);}
function viewQuery(){
  const query=new URLSearchParams();let category;
  if(isFinancial()){category='financials';query.set('metric',state.indicator==='overview'?'__overview__':state.indicator);query.set('year',state.year);}
  else if(state.indicator==='findings')category=state.dataset==='notices'?'notices':'findings';
  else if(state.indicator==='recommendations'&&state.dataset==='followups')category='recommendation_followups';
  if(!category)return null;
  query.set('category',category);if(category==='findings'&&state.topic)query.set('topic',state.topic);if(state.lgu)query.set('entity',state.lgu);
  return {category,query,key:state.entityClass+'?'+query.toString()};
}
async function render(){
  if(!data)return;
  const sequence=++renderSequence,request=viewQuery();
  try{
    if(request){
      $('#loading').textContent='Loading selected records…';$('#loading').hidden=false;
      let rows=viewCache.get(request.key);
      if(!rows){rows=(await apiJSON('/records?'+request.query)).records;viewCache.set(request.key,rows);}
      if(sequence!==renderSequence)return;
      data[request.category]=rows;
    }
    renderCurrentView();$('#loading').hidden=true;$('#content').hidden=false;$('#error').hidden=true;
  }catch(error){if(sequence===renderSequence){$('#loading').hidden=true;$('#error').textContent=error.message;$('#error').hidden=false;}}
}
async function ensureRecord(category,index){
  const rows=data[category],row=rows[index];if(!row||row._full)return row;
  const key=state.entityClass+'/'+category+'/'+row._record_id;
  let full=recordCache.get(key);
  if(!full){const result=await apiJSON('/record/'+category+'/'+row._record_id);full={...result.record,_record_id:row._record_id,_full:true};recordCache.set(key,full);}
  rows[index]=full;return full;
}
async function ensureEntity(id){
  const target=data,result=await apiJSON('/entity/'+encodeURIComponent(id));if(data!==target)return;
  for(const [category,rows] of Object.entries(result.categories)){
    const existing=data[category].filter(r=>r.entity_id!==id);data[category]=[...existing,...rows];
  }
  data.source_issues=data.source_issues.filter(r=>r.entity_id!==id);data.source_issues.push(result.issues);
}
async function loadMetricCatalog(){
  if(catalogLoaded)return;
  try{
    const dataset=state.entityClass,metrics=await apiJSON('/metrics');if(dataset!==state.entityClass)return;catalogLoaded=true;const knownMetrics=new Set(financialMetrics);
    for(const id of metrics){if(!knownMetrics.has(id)){financialMetrics.push(id);knownMetrics.add(id);}allowedIndicators.add(id);if(!labels[id])labels[id]=id.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());}
    $('#metric').innerHTML=['overview',...financialMetrics].map(id=>'<option value="'+escape(id)+'">'+escape(labels[id])+'</option>').join('');$('#metric').value=state.indicator;
  }catch(error){$('#error').textContent=error.message;$('#error').hidden=false;}
}
const originalOpenFinancial=openFinancial,originalOpenOpinion=openOpinion,originalOpenStatus=openStatus,originalOpenFinding=openFinding,originalOpenAnnex=openAnnex,originalOpenEntity=openEntity;
async function detailRequest(load,show){
  const sequence=++detailSequence;showDetail('Loading source…','', '<p>Loading the selected record and its evidence…</p>');
  try{await load();if(sequence===detailSequence)show();}catch(error){if(sequence===detailSequence)showDetail('Could not load source','', '<p>'+escape(error.message)+'</p>');}
}
openFinancial=(id,metric)=>detailRequest(()=>Promise.all(records(id,metric).map(r=>ensureRecord('financials',data.financials.indexOf(r)))),()=>originalOpenFinancial(id,metric));
openOpinion=id=>detailRequest(()=>ensureRecord('opinions',data.opinions.findIndex(r=>r.entity_id===id)),()=>originalOpenOpinion(id));
openStatus=id=>detailRequest(()=>ensureRecord('recommendation_status',data.recommendation_status.findIndex(r=>r.entity_id===id)),()=>originalOpenStatus(id));
openFinding=index=>detailRequest(()=>ensureRecord('findings',index),()=>originalOpenFinding(index));
openAnnex=(category,index)=>detailRequest(()=>ensureRecord(category,index),()=>originalOpenAnnex(category,index));
openEntity=id=>detailRequest(()=>ensureEntity(id),()=>originalOpenEntity(id));
$('#metric').addEventListener('focus',loadMetricCatalog);
$('#government-dataset').addEventListener('change',()=>{state.entityClass=$('#government-dataset').value;state.indicator='overview';state.lgu='';state.area='';state.search='';state.level=state.entityClass==='ministries'?'all':'local';detailSequence++;viewCache.clear();recordCache.clear();catalogLoaded=false;init();});
async function prepareExport(){
  const request=viewQuery();
  if(request){request.query.set('full','true');data[request.category]=(await apiJSON('/records?'+request.query)).records;}
  else if(state.indicator==='opinions'||state.indicator==='recommendations'){
    const category=state.indicator==='opinions'?'opinions':'recommendation_status';data[category]=(await apiJSON('/records?category='+category+'&full=true')).records;
  }
  renderCurrentView();
}
async function init(){
  const sequence=++initSequence;renderSequence++;
  $('#loading').textContent='Loading government directory…';$('#loading').hidden=false;$('#content').hidden=true;
  try{
    const bootstrap=await apiJSON('/bootstrap');if(sequence!==initSequence)return;data=bootstrap;const financialYears=data.financial_years.length?data.financial_years:[2024];
    if(!financialYears.includes(state.year))state.year=financialYears[0];
    $('#year').innerHTML=financialYears.map(year=>'<option value="'+year+'">'+year+'</option>').join('');
    financialMetrics.splice(0,financialMetrics.length,...data.metrics);allowedIndicators.clear();for(const id of ['overview',...financialMetrics,'opinions','recommendations','findings','coverage','sources'])allowedIndicators.add(id);
    const requested=initialSetup?metricKey(params.get('indicator')):null;initialSetup=false;if(requested&&!allowedIndicators.has(requested)){financialMetrics.push(requested);allowedIndicators.add(requested);labels[requested]=requested.replaceAll('_',' ');}if(requested&&allowedIndicators.has(requested)&&!catalogLoaded)state.indicator=requested;
    $('#indicators').innerHTML=['overview','opinions','recommendations','findings','coverage','sources'].map(id=>'<button class="nav-item" data-indicator="'+id+'">'+(id==='overview'?'Financials':id==='findings'?'Observations':id==='coverage'?'Coverage':id==='sources'?'Sources':labels[id])+'</button>').join('');
    $('#metric').innerHTML=['overview',...financialMetrics].map(id=>'<option value="'+escape(id)+'">'+escape(labels[id]||id)+'</option>').join('');
    const areas=[...new Set(data.entities.map(e=>e.province).filter(Boolean))].sort();$('#area').innerHTML='<option value="">All BARMM</option>'+areas.map(a=>'<option value="'+escape(a)+'">'+escape(a)+'</option>').join('');
    if(!areas.includes(state.area))state.area='';$('#area').value=state.area;
    if(!entity(state.lgu))state.lgu='';
    $('#government-dataset').value=state.entityClass;
    $('#level').innerHTML=state.entityClass==='ministries'?'<option value="all">All ministries / offices</option>':'<option value="local">Cities &amp; municipalities</option><option value="province">Provincial governments</option><option value="all">All governments</option>';
    if(state.entityClass==='ministries')state.level='all';
    $('#level').value=state.level;$('#year').value=String(state.year);$('#search').value=state.search;
    $('#topic').innerHTML='<option value="">All topics</option>'+data.topics.map(t=>'<option value="'+escape(t)+'">'+escape(t)+'</option>').join('');
    state.topic=data.topic_aliases?.[state.topic]||state.topic;
    if(data.topics.includes(state.topic))$('#topic').value=state.topic;else state.topic='';
    $('.json-download').href=assetPath('data.json');document.querySelector('a[href$="release-coverage.csv"]').href=assetPath('release-coverage.csv');
    await render();
  }catch(error){$('#loading').hidden=true;$('#error').textContent=error.message;$('#error').hidden=false;}
}
init();
