import {LEVELS,SECTORS,quickRange,query,exportCSV,announcementSections,columnLabel,departmentGroups,projectStatus,APPLICATION_LABELS,linkStatusLabel,openArchive,enterpriseDeadlineLines} from './search.mjs';
const $=id=>document.getElementById(id);let dataset=null,lastError='',deploymentError='';const selected=new Set();let currentItems=[];
function el(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;}
function link(url,label,cls){const a=el('a',cls,label);try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||!u.hostname.endsWith('.gov.cn')||u.username||u.password)throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');}return a;}
function range(n){const r=quickRange(n);$('start').value=r.start;$('end').value=r.end;document.querySelectorAll('[data-days]').forEach(b=>b.classList.toggle('active',+b.dataset.days===n));render();}
function render(){if(!dataset)return;const filter={start:$('start').value,end:$('end').value,q:$('search').value.trim(),level:$('level').value,sector:$('sector').value,type:$('type').value};let result;try{result=query(dataset,filter);}catch(e){$('notice').hidden=false;$('notice').textContent=e.message;return;}
 const {sources,items,stats,undated}=result;currentItems=items;for(const id of selected){if(!items.some(n=>n.id===id))selected.delete(id);}$('rangeLabel').textContent=`官网公开日期：${filter.start} 至 ${filter.end}（北京时间）`;
 $('updated').textContent='最后成功数据：'+new Date(dataset.last_success_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' 北京时间';
 for(const [id,key] of [['s-sites','configured'],['s-updated','updated'],['s-items','items'],['s-empty','not_found']])$(id).textContent=stats[key];
 $('status').textContent=`已配置 ${stats.configured} 个政府网站、${stats.columns} 个独立栏目。未发现更新表示当前筛选未检出公告，不代表所有栏目均已完成检查。`;
 const root=$('sources');root.replaceChildren();const assigned=new Set(),assignedUndated=new Set();let cardIndex=0;
 for(const [level,label] of Object.entries(LEVELS)){
  const scoped=sources.filter(s=>s.levels.includes(level));if(!scoped.length)continue;
  const heading=el('h2','section-title',label);root.append(heading);const grid=el('div','sources');
  for(const {name,cols,groupItems,unknown} of departmentGroups(scoped,items.filter(n=>n.level===level&&!assigned.has(n.id)),undated.filter(n=>n.level===level&&!assignedUndated.has(n.id)),level)){const card=el('article','source'),head=el('div','source-top');head.append(el('span','num',String(++cardIndex)),el('span','source-title',name),el('span','tag'+(groupItems.length?' up':''),`${groupItems.length}条`),link(cols[0].homepage,'官网 ↗','home'));card.append(head);const body=el('div','source-body');
   for(const section of announcementSections(groupItems)){
    const area=el('details','announcement-section');area.open=true;area.dataset.type=section.type;
    area.append(el('summary','',`${section.label}（${section.items.length}条）`));
    for(const n of section.items){assigned.add(n.id);const item=el('div','item');const selectRow=el('div','item-select'),checkbox=el('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label','选择公告：'+n.title);checkbox.checked=selected.has(n.id);checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(n.id);else selected.delete(n.id);renderSelection();});const titleLink=link(n.url,n.title,'item-name');titleLink.dataset.noticeId=n.id;selectRow.append(checkbox,titleLink);item.append(selectRow);item.append(el('div','item-detail',`${SECTORS[n.sector]||'综合'} · ${n.publisher}`));item.append(el('div','item-detail','官网公开日期：'+n.public_date+(n.public_at?' '+new Date(n.public_at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'')));if(n.issue_date)item.append(el('div','item-detail issue-date','文件成文日期：'+n.issue_date));appendReview(item,n);area.append(item);}
    body.append(area);
   }
   if(!groupItems.length)body.append(el('div','none',(filter.q||filter.type!=='all')?'当前筛选没有匹配公告':'所选范围未发现更新'));
   const details=el('details','column-details');details.append(el('summary','',`${cols.length} 个独立栏目`));for(const c of cols){const n=items.filter(i=>i.source_ids.includes(c.id)).length;const row=el('div','item-detail');row.append(link(c.url,columnLabel(c.name),'column-link'),el('span','',` · ${n}条`));details.append(row);}body.append(details);card.append(body);grid.append(card);
  }root.append(grid);
 }
 renderSeparateArchives(result,filter);
 renderSelection();
 if(!items.length)root.prepend(el('p','empty','所选条件未发现公告记录。'));
 const age=Date.now()-new Date(dataset.last_success_at);const warnings=[lastError,deploymentError];if(stats.abnormal)warnings.push('部分栏目在所选范围的采集记录不完整，当前结果可能有遗漏，请以官网为准。');if(age>=36*3600000)warnings.push('数据暂未更新，当前展示上次成功快照，请以官网为准。');$('notice').hidden=!warnings.some(Boolean);$('notice').textContent=warnings.filter(Boolean).join(' ');
}

function appendReview(item,n){
 const review=dataset.announcement_reviews?.[n.id];
 if(n.type==='project'){
  const status=projectStatus(n,review),change=review?.application?.change;
  item.append(el('div','item-detail application-status','申报状态：'+(change==='extended'?'已延期 · ':change==='reopened'?'重新开放 · ':'')+APPLICATION_LABELS[status]));
 }
 for(const line of enterpriseDeadlineLines(n,review))item.append(el('div','item-detail',line));
 const label=linkStatusLabel(review);if(label)item.append(el('div','item-detail official-link-status',label));
}
function separateRows(root,rows,label,description,unknown){
 root.replaceChildren();root.hidden=!rows.length;if(!rows.length)return;
 root.append(el('h2','section-title',label),el('p','status',description));
 const groups=new Map();for(const n of rows){const name=n.publisher||'发布机构未明确';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(n);}
 const grid=el('div','sources');
 for(const [name,notices] of groups){
  const card=el('article','source'),head=el('div','source-top');head.append(el('span','source-title',name));card.append(head);
  const body=el('div','source-body');
  for(const type of ['project','policy']){
   const ns=notices.filter(n=>n.type===type);if(!ns.length)continue;
   const area=el('details',unknown?'undated-section':'open-archive-section');area.open=true;area.dataset.type=type;
   area.append(el('summary','',(type==='project'?'项目申报':'涉企政策')+'（'+ns.length+'条）'));
   for(const n of ns){const item=el('div','item');const a=link(n.url,n.title,unknown?'undated-name':'open-archive-name');a.dataset.noticeId=n.id;item.append(a,el('div','item-detail','发布部门：'+n.publisher),el('div','item-detail',unknown?'官网公开日期待确认':'官网公开日期：'+n.public_date));if(n.issue_date)item.append(el('div','item-detail issue-date','文件成文日期：'+n.issue_date));appendReview(item,n);area.append(item);}
   body.append(area);
  }
  card.append(body);grid.append(card);
 }
 root.append(grid);
}
function renderSeparateArchives(result,filter){
 separateRows($('uncertain-dates'),result.undated,'发布日期待确认公告','以下公告不属于上方所选日期范围的检索结果，不计入新增数量。取得可靠官网日期后再归档。',true);
 separateRows($('open-archive'),openArchive(dataset,filter),'历史发布、当前仍可申报','以下项目依据已核实企业申报期限展示，不属于所选日期范围的新增数量；上方已列项目不重复显示。',false);
}

function renderSelection(){const rows=currentItems.filter(n=>selected.has(n.id));$('selected-count').textContent=rows.length;$('selection-empty').hidden=rows.length>0;const body=$('selected-rows');body.replaceChildren();rows.forEach((n,i)=>{const tr=el('tr');tr.append(el('td','',i+1),el('td','',n.public_date));const title=el('td');title.append(link(n.url,n.title));tr.append(title,el('td','',n.publisher),el('td','',n.issue_date||''));body.append(tr);});$('export').disabled=!rows.length;}
$('select-all').addEventListener('click',()=>{currentItems.forEach(n=>selected.add(n.id));render();});$('clear').addEventListener('click',()=>{selected.clear();render();});$('export').addEventListener('click',()=>{const rows=currentItems.filter(n=>selected.has(n.id));if(!rows.length)return;const url=URL.createObjectURL(new Blob([exportCSV(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='政府公告_'+$('start').value+'_'+$('end').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
for(const b of document.querySelectorAll('[data-days]'))b.addEventListener('click',()=>range(+b.dataset.days));$('apply').addEventListener('click',()=>{document.querySelectorAll('[data-days]').forEach(b=>b.classList.remove('active'));render();});$('search').addEventListener('input',render);for(const id of ['level','sector','type'])$(id).addEventListener('change',render);range(1);
async function load(){try{const r=await fetch('data/public.json',{cache:'no-store'});if(!r.ok)throw Error('数据不可用');const d=await r.json();if(![1,2,3].includes(d.schema_version)||!Array.isArray(d.sources)||!Array.isArray(d.announcements))throw Error('数据格式异常');dataset=d;lastError='';try{localStorage.setItem('public-policy-cache-v1',JSON.stringify(d));}catch{};try{const s=await fetch('data/status.json',{cache:'no-store'});if(s.ok){const status=await s.json();if(status.status==='error')lastError='最近一次更新未完成，保留上次成功数据。';}}catch{}render();}catch{try{dataset=JSON.parse(localStorage.getItem('public-policy-cache-v1'));}catch{}lastError='公开数据加载失败，当前为上次成功缓存；不能据此认定无更新。';if(dataset)render();else{$('notice').hidden=false;$('notice').textContent='公开数据暂不可用，统计未生成。请稍后重试。';$('status').textContent='未加载成功，不将未知状态显示为零。';}}}
load();
fetch('https://api.github.com/repos/chenxingzi2371-sys/government-policy-public-site/actions/workflows/pages.yml/runs?per_page=1',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(d=>{const run=d?.workflow_runs?.[0];if(run&&['failure','timed_out','cancelled'].includes(run.conclusion)){deploymentError='最近一次网页部署或验收未完成，当前保留上次成功页面与数据。';if(dataset)render();}}).catch(()=>{});
