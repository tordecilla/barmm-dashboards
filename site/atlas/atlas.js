/* The public app has no dependency on the private proposal API. */
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, unit='') => value == null ? 'Not available' : new Intl.NumberFormat('en-PH',{maximumFractionDigits:unit==='people'?0:unit==='coefficient'?4:2}).format(value);
const levelNames = {region:'Region',province:'Province / historical aggregate',municipality:'City / municipality',barangay:'Barangay'};
let observationLookup=new Map(), indicatorRows=new Map(), placeRows=new Map();
let data, geo, places, sources, indicator, selected='', page=0, sort='value', ascending=false;
let drawnFeatures=[], currentRows=[], color, projection, path, zoom, sourceLimit=20, view='tables';
const svg=d3.select('#map svg'), group=svg.append('g');
function opts(id, values, chosen) {$(id).innerHTML=values.map(v=>`<option value="${esc(v[0])}">${esc(v[1])}</option>`).join(''); if(values.some(v=>String(v[0])===String(chosen)))$(id).value=chosen;}
const monthNames=['Annual total','January','February','March','April','May','June','July','August','September','October','November','December'];
const dims=()=>({sex:$('sex').value||'all',month:Number($('period').value)||0,ageGroup:$('age-group').value||'all',category:$('category').value||'all'});
const obsKey=(place,iid,year,sex='all',month=0,age='all',category='all')=>[place,iid,year,sex,month,age,category].join('|');
function observation(place,iid=indicator.id,year=Number($('year').value)){const d=iid===indicator.id?dims():{sex:'all',month:0,ageGroup:'all',category:'all'};return observationLookup.get(obsKey(place,iid,year,d.sex,d.month,d.ageGroup,d.category));}
function matchingDimensions(o){const d=dims();return (o.sex||'all')===d.sex&&(o.month||0)===d.month&&(o.ageGroup||'all')===d.ageGroup&&(o.category||'all')===d.category;}
function breakdownLabel(){const d=dims();return [d.month?monthNames[d.month]:'',d.sex==='all'?'':(indicator.id==='registered-marriages'?'Spouse: ':'')+d.sex,d.ageGroup==='all'?'':'Age: '+d.ageGroup,d.category==='all'?'':d.category].filter(Boolean).join(' / ');}
function updateBreakdowns(){
 const os=(indicatorRows.get(indicator.id)||[]).filter(o=>o.year===Number($('year').value));
 const months=[...new Set(os.map(o=>o.month||0))].sort((a,b)=>a-b);opts('period',months.map(m=>[m,monthNames[m]]),months.includes(Number($('period').value))?$('period').value:months.includes(0)?0:months.at(-1));
 const periods=os.filter(o=>(o.month||0)===Number($('period').value));const sexes=[...new Set(periods.map(o=>o.sex||'all'))].sort((a,b)=>['all','male','female'].indexOf(a)-['all','male','female'].indexOf(b));
 opts('sex',sexes.map(s=>[s,s==='all'?(indicator.id==='registered-marriages'?'All marriages':'Both sexes'):s==='male'?'Male':'Female']),$('sex').value);
 const ages=[...new Set(periods.filter(o=>(o.sex||'all')===$('sex').value).map(o=>o.ageGroup||'all'))];opts('age-group',ages.map(a=>[a,a==='all'?'All ages':a]),$('age-group').value);
 $('period-label').hidden=months.length<2;$('sex-label').hidden=sexes.length<2;$('age-label').hidden=ages.length<2;
 const categories=[...new Set(periods.filter(o=>(o.sex||'all')===$('sex').value&&(o.ageGroup||'all')===($('age-group').value||'all')).map(o=>o.category||'all'))];opts('category',categories.map(c=>[c,c==='all'?'Total / all groups':c]),$('category').value||indicator.defaultCategory||'all');$('category-label').hidden=categories.length<2;$('category-title').textContent=indicator.categoryLabel||'Category';
 const show=categories.length>1||months.length>1||sexes.length>1||ages.length>1;$('breakdowns').hidden=!show;document.querySelector('.filters').classList.toggle('has-breakdowns',show);document.documentElement.style.setProperty('--toolbar',show?'140px':innerWidth<=700?'74px':'70px');
}
function isHistorical(p){return p.historical || (p.parent && places.get(p.parent)?.historical);}
function allowed(p){return $('sulu').checked || !(p.id.startsWith('19066')||String(p.parent||'').startsWith('19066'));}
function parentLabel(p){return places.get(p.parent)?.name||'Published regional coverage';}
function changeIndicator(id, keepLevel=false){
 indicator=data.indicators.find(i=>i.id===id);$('category').value=indicator.defaultCategory||'all';
 document.querySelectorAll('#indicator-list [data-indicator]').forEach(b=>{b.classList.toggle('active',b.dataset.indicator===id);if(b.dataset.indicator===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 opts('year',indicator.years.slice().reverse().map(y=>[y,y]),$('year').value);
 const municipalCount=data.observations.filter(o=>o.indicator===indicator.id&&places.get(o.place).level==='municipality').length;
 const preferred=keepLevel&&indicator.levels.includes($('level').value)?$('level').value:indicator.levels.includes('municipality')&&municipalCount>25?'municipality':indicator.levels.includes('province')?'province':'region';
 opts('level',indicator.levels.map(l=>[l,levelNames[l]]),preferred); page=0; render();
}
function visiblePlaces(){return data.places.filter(p=>p.level===$('level').value&&allowed(p));}
function rows(){let result=visiblePlaces().map(p=>({p,o:observation(p.id)})); const term=$('search').value.trim().toLowerCase(), prov=$('province').value;
 if(term)result=result.filter(({p})=>(p.name+' '+parentLabel(p)).toLowerCase().includes(term));
 if(prov)result=result.filter(({p})=>p.id===prov||p.parent===prov||places.get(p.parent)?.parent===prov);
 result.sort((a,b)=>sort==='place'?(ascending?1:-1)*a.p.name.localeCompare(b.p.name):a.o?.value==null?b.o?.value==null?a.p.name.localeCompare(b.p.name):1:b.o?.value==null?-1:(ascending?1:-1)*(a.o.value-b.o.value)||a.p.name.localeCompare(b.p.name));return result;}
function render(){
 const levelYears=[...new Set((indicatorRows.get(indicator.id)||[]).filter(o=>places.get(o.place).level===$('level').value).map(o=>o.year))].sort((a,b)=>b-a);opts('year',levelYears.map(y=>[y,y]),$('year').value);
 updateBreakdowns();
 const year=Number($('year').value), level=$('level').value;
 syncViews();
 $('map-title').textContent=indicator.label; $('map-subtitle').textContent=`${year} / ${levelNames[level]} / ${indicator.unit}${breakdownLabel()?' / '+breakdownLabel():''}`;
 const scope=$('province').value;
 const eligible=visiblePlaces().filter(p=>!scope||p.id===scope||p.parent===scope||places.get(p.parent)?.parent===scope);
 const vals=eligible.map(p=>observation(p.id)?.value).filter(v=>v!=null);
 let domain=d3.extent(vals);if(domain[0]===domain[1])domain=[0,domain[1]||1];if(!vals.length)domain=[0,1];
 color=d3.scaleSequential(d3.interpolateRgb('#edf5e8','#285e3b')).domain(domain);
 $('legend').innerHTML=level==='region'?'<span>Region</span>':`<span>${num(domain[0],indicator.unit)}</span><span class="ramp"></span><span>${num(domain[1],indicator.unit)} ${esc(indicator.unit)}</span><span class="missing-key"></span><span>No data</span>`;
 $('map-note').textContent=level==='barangay'?'Barangay boundaries unavailable':level==='region'?'Regional data':level==='province'?'Boundary year: 2023':'Boundary year: 2023 / SGA: Data Tables';
 const fs=geo.features.filter(f=>allowed(places.get(f.properties.id))&&(!scope||f.properties.parent===scope));
 drawnFeatures=fs;
 const collection={type:'FeatureCollection',features:fs.length?fs:geo.features.filter(f=>allowed(places.get(f.properties.id)))};
 const bounds=$('map').getBoundingClientRect(), w=Math.max(300,bounds.width), h=Math.max(200,bounds.height);
 svg.attr('viewBox',`0 0 ${w} ${h}`);
 const occupied=0;
 projection=d3.geoIdentity().reflectY(true).fitExtent([[35,90],[Math.max(200,w-35-occupied),Math.max(150,h-110)]],collection);path=d3.geoPath(projection);
 group.selectAll('*').remove();
 group.selectAll('path').data(fs).join('path').attr('class',f=>'locality'+(f.properties.id===selected?' selected':''))
 .attr('d',path).attr('fill',f=>{const pid=level==='province'?f.properties.parent:f.properties.id;const v=observation(pid)?.value;return ['region','barangay'].includes(level)?'#dce4e8':v==null?'#dce1e5':color(v);})
 .attr('tabindex',level==='barangay'?null:0).attr('role',level==='barangay'?null:'button').attr('aria-label',f=>f.properties.name)
 .on('click',(e,f)=>{if(level!=='barangay')selectPlace(level==='region'?'1900000000':level==='province'?f.properties.parent:f.properties.id);})
 .on('keydown',(e,f)=>{if(level!=='barangay'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectPlace(level==='region'?'1900000000':level==='province'?f.properties.parent:f.properties.id);}})
 .on('pointermove',(e,f)=>{const pid=level==='province'?f.properties.parent:f.properties.id;const o=observation(pid);const bounds=$('map').getBoundingClientRect();$('tooltip').innerHTML=`<strong>${esc(places.get(pid)?.name||f.properties.name)}</strong>${['region','barangay'].includes(level)?'See the table for this level':num(o?.value,indicator.unit)+' '+esc(indicator.unit)}`;Object.assign($('tooltip').style,{display:'block',left:Math.min(e.clientX-bounds.left+14,bounds.width-230)+'px',top:Math.max(0,e.clientY-bounds.top-65)+'px'});})
 .on('pointerleave',()=>{$('tooltip').style.display='none';});
 const labelIds=['1900700000','1903600000','1908700000','1908800000','1907000000','1906600000'];
 for(const pid of labelIds){const part=fs.filter(f=>f.properties.parent===pid);if(!part.length)continue;const center=path.centroid({type:'FeatureCollection',features:part});group.append('text').attr('class','map-label').attr('x',center[0]).attr('y',center[1]).attr('text-anchor','middle').text(places.get(pid).name).each(function(){const box=this.getBBox(),x=Number(this.getAttribute('x'));this.setAttribute('x',Math.max(box.width/2+12,Math.min(w-box.width/2-12,x)));});}
 svg.call(zoom.transform,d3.zoomIdentity);
 let selectedPlace=places.get(selected);
 while(selectedPlace&&selectedPlace.level!==level&&selectedPlace.parent)selectedPlace=places.get(selectedPlace.parent);
 selected=selectedPlace&&selectedPlace.level===level&&allowed(selectedPlace)&&(!scope||selectedPlace.id===scope||selectedPlace.parent===scope||places.get(selectedPlace.parent)?.parent===scope)?selectedPlace.id:'';
 renderTable();renderCharts();renderMapData();renderProfile();
 $('table-title').textContent=indicator.label;$('indicator-note').textContent=indicator.note||'';
 $('method').innerHTML=`<h2>${esc(indicator.label)}</h2><p>${year} / ${esc(indicator.unit)} / ${indicator.levels.map(l=>levelNames[l]).join(', ')}</p><p>${esc(indicator.description)}</p><p>${esc(indicator.note)}</p>${indicator.sources.map(sid=>`<a href="${esc(sources.get(sid).url)}" target="_blank" rel="noopener">${esc(sources.get(sid).title)}</a>`).join('<br>')}`;
 const u=new URL(location);u.searchParams.set('indicator',indicator.id);u.searchParams.set('year',year);u.searchParams.set('level',level);if(selected)u.searchParams.set('place',selected);else u.searchParams.delete('place');if($('sulu').checked)u.searchParams.set('historical','1');else u.searchParams.delete('historical');for(const [key,value] of Object.entries(dims())){if(value==='all'||value===0)u.searchParams.delete(key);else u.searchParams.set(key,value);}u.searchParams.set('view',view);history.replaceState(null,'',u);
}
function supportsMap(){
 const level=$('level').value;
 if(!['province','municipality'].includes(level))return false;
 const ids=new Set(geo.features.map(f=>level==='province'?f.properties.parent:f.properties.id));
 return data.observations.some(o=>o.indicator===indicator.id&&o.year===Number($('year').value)&&ids.has(o.place));
}
function syncViews(){
 const mapped=supportsMap();
 document.querySelector('[data-view=map]').hidden=!mapped;
 if(view==='map'&&!mapped)view='tables';
 document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.view===view));b.tabIndex=b.dataset.view===view?0:-1;});
 for(const name of ['map','charts','tables','sources']){$('view-'+name).hidden=name!==view;}
}
function setView(next){
 view=next;syncViews();
 const u=new URL(location);u.searchParams.set('view',view);history.replaceState(null,'',u);
 renderMapData();renderProfile();
 if(view==='map')render();
}
function selectPlace(id){selected=id;render();}
function renderMapData(){
 const panel=$('map-data');panel.hidden=!['map','charts'].includes(view);
 const values=rows(),years=indicator.years.slice().reverse();
 $('data-panel-title').textContent=indicator.label;
 $('data-panel-meta').textContent=`${indicator.unit} / ${values.filter(r=>r.o).length} values / ${values.length} places`;
 $('map-data-head').innerHTML=`<tr><th>Place</th>${years.map(y=>`<th class="${y===Number($('year').value)?'current-year':''}">${y}</th>`).join('')}</tr>`;
 $('map-data-rows').innerHTML=values.map(({p})=>`<tr class="${p.id===selected?'active':''}"><td><button data-place="${esc(p.id)}">${esc(p.name)}</button>${p.level!=='region'?`<span class="row-parent">${esc(parentLabel(p))}</span>`:''}</td>${years.map(y=>{const o=observation(p.id,indicator.id,y);return `<td class="${y===Number($('year').value)?'current-year':''}">${o?num(o.value,indicator.unit)+(indicator.unit==='%'?'%':''):'&mdash;'}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${years.length+1}" class="empty">No data</td></tr>`;
 $('map-data-rows').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>selectPlace(b.dataset.place));
}
function renderCharts(){
 $('chart-title').textContent=indicator.label;$('chart-subtitle').textContent=`${$('year').value} / ${levelNames[$('level').value]} / ${indicator.unit}${breakdownLabel()?' / '+breakdownLabel():''}`;
 const values=rows().filter(r=>r.o), low=Math.min(0,d3.min(values,r=>r.o.value)||0),high=Math.max(0,d3.max(values,r=>r.o.value)||0),range=high-low||1,zero=-low/range*100;
 $('chart').innerHTML=values.map(({p,o})=>`<div class="chart-row"><button class="chart-place" data-place="${esc(p.id)}">${esc(p.name)}</button><div class="chart-track"><div class="chart-bar" style="left:${o.value<0?(o.value-low)/range*100:zero}%;width:${100*Math.abs(o.value)/range}%"></div></div><span class="chart-value">${num(o.value,indicator.unit)}${indicator.unit==='%'?'%':''}</span></div>`).join('')||'<p class="empty">No data</p>';
 $('chart').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>selectPlace(b.dataset.place));
}

function renderTable(){currentRows=rows();page=Math.min(page,Math.max(0,Math.ceil(currentRows.length/25)-1));const avail=currentRows.filter(r=>r.o).length;
 $('table-count').textContent=`${$('year').value}${breakdownLabel()?' / '+breakdownLabel():''} / ${indicator.unit} / ${avail} values / ${currentRows.length} places`;
 $('extra-heading').textContent=currentRows.some(({o})=>o?.lower!=null)?'Confidence interval':'Geographic level';
 $('rows').innerHTML=currentRows.slice(page*25,page*25+25).map(({p,o})=>`<tr class="${p.id===selected?'active':''}"><td><button type="button" data-place="${esc(p.id)}">${esc(p.name)}</button>${isHistorical(p)?'<span class="historical-badge">HISTORICAL GEOGRAPHY</span>':''}</td><td>${esc(parentLabel(p))}</td><td>${num(o?.value,indicator.unit)}${o&&indicator.unit==='%'?'%':''}</td><td>${currentRows.some(({o})=>o?.lower!=null)?o?.lower!=null?`${num(o.lower)}–${num(o.upper)}% (${o.confidenceLevel}%)`:'—':esc(levelNames[p.level])}</td><td>${o?`<a href="${esc(sources.get(o.source).url)}" target="_blank" rel="noopener">PSA · ${esc(o.sheet)} ↗</a>`:'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No places match these filters.</td></tr>';
 $('rows').querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>selectPlace(b.dataset.place)));
 $('pagination').innerHTML=`<button id="prev" ${page===0?'disabled':''}>← Previous</button><span>Page ${page+1} of ${Math.max(1,Math.ceil(currentRows.length/25))}</span><button id="next" ${page>=Math.ceil(currentRows.length/25)-1?'disabled':''}>Next →</button>`;
 $('prev').onclick=()=>{page--;renderTable();};$('next').onclick=()=>{page++;renderTable();};
}
function renderProfile(){
 const p=places.get(selected), panel=document.querySelector('.profile');
 panel.hidden=!p||view==='sources';document.body.classList.toggle('has-selection',Boolean(p)&&view!=='sources');
 if(!p){$('profile').innerHTML='';return;}
 const o=observation(p.id), historyRows=(placeRows.get(p.id)||[]).filter(o=>o.indicator===indicator.id&&matchingDimensions(o)).sort((a,b)=>a.year-b.year), max=d3.max(historyRows,o=>o.value)||1;
 const others=data.indicators.map(i=>({i,os:(placeRows.get(p.id)||[]).filter(o=>o.indicator===i.id&&(o.sex||'all')==='all'&&(o.month||0)===0&&(o.ageGroup||'all')==='all'&&(o.category||'all')==='all').sort((a,b)=>b.year-a.year)})).filter(r=>r.os.length&&r.i.id!==indicator.id);
 const source=o?sources.get(o.source):null;
 $('profile').innerHTML=`<h3>${esc(p.name)}</h3><p class="parent">${esc(levelNames[p.level])} / ${esc(parentLabel(p))}</p><p class="metric-label">${esc(indicator.label)} / ${$('year').value}${breakdownLabel()?' / '+esc(breakdownLabel()):''}</p>${o?`<div class="big">${num(o.value,indicator.unit)}${indicator.unit==='%'?'%':''}</div><div class="unit">${esc(indicator.unit)}</div>${o.lower!=null?`<p class="interval">${o.confidenceLevel}% interval: ${num(o.lower)}-${num(o.upper)}${indicator.unit==='%'?'%':''}</p><p class="interval">CV: ${num(o.cv)}%</p>`:''}<p class="citation"><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.publisher)}</a><br>${esc(o.sheet)} / row ${o.row}${o.sourceLabel?'<br>'+esc(o.sourceLabel):''}${o.geographicCoverage?'<br>Coverage: '+esc(o.geographicCoverage):''}${o.cv!=null?'<br>CV: '+num(o.cv)+'%':''}${o.cvCitation?'<br>CV source: '+esc(o.cvCitation.sheet)+' / row '+o.cvCitation.row+' / column '+esc(o.cvCitation.column):''}${o.sourceColumn?'<br>Source column: '+esc(o.sourceColumn):''}${o.derived?'<br>'+esc(o.derived):''}${p.geometryMissing?'<br>No boundary geometry for this published area.':''}${o.sourceCode?'<br>Source PSGC: '+esc(o.sourceCode):''}</p>`:'<p class="missing">Not available</p>'}${historyRows.length>1?`<div class="history" aria-label="Values by source year">${historyRows.map(h=>`<div><strong>${num(h.value,indicator.unit)}</strong><div class="bar" style="height:${Math.max(2,55*h.value/max)}px"></div><span>${h.year}</span></div>`).join('')}</div>`:''}<div class="other-values"><h4>Indicators</h4>${others.map(({i,os})=>`<button data-indicator="${i.id}" data-year="${os[0].year}"><span>${esc(i.label)}<br><small>${os[0].year} / ${esc(i.unit)}</small></span><span>${num(os[0].value,i.unit)}${i.unit==='%'?'%':''}</span></button>`).join('')}</div>${p.level!=='region'?`<p class="context-note"><button class="context-parent" data-place="${esc(p.parent)}">${esc(parentLabel(p))}</button></p>`:''}`;
 $('profile').querySelectorAll('[data-indicator]').forEach(b=>b.onclick=()=>{changeIndicator(b.dataset.indicator);$('year').value=b.dataset.year;render();});
 $('profile').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>{const parent=places.get(b.dataset.place);if(indicator.levels.includes(parent.level))$('level').value=parent.level;else {selected='';render();return;}selectPlace(parent.id);});
}

function renderSources(){const term=$('source-search').value.toLowerCase(), status=$('source-status').value;
 const result=data.sources.filter(s=>(!status||s.status===status)&&(!term||(s.title+' '+data.indicators.filter(i=>i.sources.includes(s.id)).map(i=>i.label).join(' ')).toLowerCase().includes(term)));
 $('sources').innerHTML=result.slice(0,sourceLimit).map(s=>`<article class="source-card"><div class="source-state ${s.status==='Integrated'?'ready':''}">${esc(s.status)}<br>${esc(s.format.toUpperCase())}</div><div><h3>${esc(s.title)}</h3><p>${esc(s.publisher)}${s.status==='Integrated'?' / '+data.indicators.filter(i=>i.sources.includes(s.id)).map(i=>esc(i.label)).join('; '):''}</p><details><summary>File provenance</summary>SHA-256: ${esc(s.sha256)}${s.release?`<br>Release: ${esc(s.release)}<br>Retrieved: ${esc(s.retrieved)}`:''}</details></div><div class="source-links"><a href="${esc(s.url)}" target="_blank" rel="noopener">Original source ↗</a>${s.localScrapeCheck?`<a href="${esc(sources.get(s.localScrapeCheck.localSource).file)}" download>Local scrape file</a>`:''}${s.file?`<a href="${esc(s.file)}" download>Saved source file ↓</a>`:''}${s.articleUrl?`<a href="${esc(s.articleUrl)}" target="_blank" rel="noopener">Dataset / release ↗</a>`:''}</div></article>`).join('')||'<p class="empty">No sources match this search.</p>';
 if(result.length>sourceLimit){const b=document.createElement('button');b.className='more-sources';b.textContent=`Show more sources (${result.length-sourceLimit} remaining)`;b.onclick=()=>{sourceLimit+=20;renderSources();};$('sources').append(b);}
}
function exportView(){const cols=['place','parent','level','indicator','year','value','unit','lower','upper','confidence_level','method','cv','source_url','source_sheet','source_row','source_column','sex','month','age_group','derived','reference_date','source_note','category','cv_citation','geographic_coverage','revision','source_status'];const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const content='\ufeff'+[cols,...currentRows.map(({p,o})=>[p.name,parentLabel(p),p.level,indicator.label,$('year').value,o?.value,indicator.unit,o?.lower,o?.upper,o?.confidenceLevel,o?.method,o?.cv,o?sources.get(o.source).url:'',o?.sheet,o?.row,o?.sourceColumn,dims().sex,dims().month,dims().ageGroup,o?.derived,o?.referenceDate,indicator.note,dims().category,JSON.stringify(o?.cvCitation||null),o?.geographicCoverage,o?.revision,o?.sourceStatus])].map(r=>r.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`barmm-${indicator.id}-${$('year').value}-${$('level').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function init(){try{
 const responses=await Promise.all([fetch('data.json?v=remove-sparse-20261013'),fetch('municipalities.geojson')]);for(const r of responses)if(!r.ok)throw new Error('Source files could not be loaded');[data,geo]=await Promise.all(responses.map(r=>r.json()));places=new Map(data.places.map(p=>[p.id,p]));sources=new Map(data.sources.map(s=>[s.id,s]));
 for(const o of data.observations){observationLookup.set(obsKey(o.place,o.indicator,o.year,o.sex||'all',o.month||0,o.ageGroup||'all',o.category||'all'),o);if(!indicatorRows.has(o.indicator))indicatorRows.set(o.indicator,[]);indicatorRows.get(o.indicator).push(o);if(!placeRows.has(o.place))placeRows.set(o.place,[]);placeRows.get(o.place).push(o);}
 zoom=d3.zoom().scaleExtent([1,9]).on('zoom',e=>group.attr('transform',e.transform));svg.call(zoom).on('dblclick.zoom',null);
 const topics=[...new Set(data.indicators.map(i=>i.topic))];
 $('indicator-list').innerHTML=topics.map(topic=>`<section class="nav-section"><h2>${esc(topic)}</h2>${data.indicators.filter(i=>i.topic===topic).map(i=>`<button type="button" class="nav-item" data-indicator="${esc(i.id)}">${esc(i.label)}</button>`).join('')}</section>`).join('');
 $('indicator-list').querySelectorAll('[data-indicator]').forEach(b=>b.onclick=()=>{changeIndicator(b.dataset.indicator);if(innerWidth<=700){document.body.classList.remove('nav-open');syncNav();}$('search').value='';page=0;renderTable();renderCharts();renderMapData();});
 function syncNav(){const open=innerWidth<=700?document.body.classList.contains('nav-open'):!document.body.classList.contains('nav-collapsed');$('nav-toggle').setAttribute('aria-expanded',String(open));$('nav-toggle').innerHTML=innerWidth<=700?'&#9776;':open?'&#8249;':'&#8250;';$('nav-overlay').hidden=!(innerWidth<=700&&open);$('indicator-nav').inert=!open;}
 $('nav-toggle').onclick=()=>{document.body.classList.toggle(innerWidth<=700?'nav-open':'nav-collapsed');syncNav();if(view==='map')render();};
 $('nav-overlay').onclick=()=>{document.body.classList.remove('nav-open');syncNav();};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('nav-open')){document.body.classList.remove('nav-open');syncNav();$('nav-toggle').focus();}});
 window.addEventListener('resize',syncNav);syncNav();
 const provs=data.places.filter(p=>p.level==='province'&&p.id!=='legacy-maguindanao');opts('province',[['','All parent areas'],...provs.map(p=>[p.id,p.name])]);
 const params=new URLSearchParams(location.search);selected=places.has(params.get('place'))?params.get('place'):'';view=['map','charts','tables','sources'].includes(params.get('view'))?params.get('view'):'tables';$('sulu').checked=params.get('historical')==='1';
 changeIndicator(data.indicators.some(i=>i.id===params.get('indicator'))?params.get('indicator'):'poverty');
 if(indicator.years.includes(Number(params.get('year'))))$('year').value=params.get('year');if(indicator.levels.includes(params.get('level')))$('level').value=params.get('level');updateBreakdowns();if(params.has('month')){$('period').value=params.get('month');updateBreakdowns();}if(params.has('sex')){$('sex').value=params.get('sex');updateBreakdowns();}if(params.has('ageGroup'))$('age-group').value=params.get('ageGroup');updateBreakdowns();if(params.has('category'))$('category').value=params.get('category');render();
 for(const id of ['year','level','sulu','province','period','sex','age-group','category'])$(id).onchange=()=>{if(id==='level')$('search').value='';page=0;render();};$('search').oninput=()=>{page=0;renderTable();renderCharts();renderMapData();};
 $('sort-place').onclick=()=>{ascending=sort==='place'?!ascending:true;sort='place';page=0;renderTable();};$('sort-value').onclick=()=>{ascending=sort==='value'?!ascending:false;sort='value';page=0;renderTable();};
 $('reset-map').onclick=()=>svg.call(zoom.transform,d3.zoomIdentity);$('export').onclick=exportView;
 $('close-profile').onclick=()=>{selected='';render();};$('indicator-source').onclick=()=>setView('sources');
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){selected='';render();}});
 document.querySelectorAll('[data-view]').forEach(b=>{b.onclick=()=>setView(b.dataset.view);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const buttons=[...document.querySelectorAll('[data-view]')].filter(b=>!b.hidden),i=buttons.indexOf(b),next=buttons[(i+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length];setView(next.dataset.view);next.focus();}};});setView(view);
 let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{render();},100);});
 $('source-search').oninput=()=>{sourceLimit=20;renderSources();};$('source-status').onchange=()=>{sourceLimit=20;renderSources();};renderSources();
 $('geo-sources').innerHTML=data.geographySources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('');
 }catch(e){$('error').hidden=false;$('error').textContent=e.message;console.error(e);}}
init();
