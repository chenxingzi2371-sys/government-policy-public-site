export const LEVELS={national:'国家',jiangsu:'江苏省',nanjing:'南京市',qixia:'栖霞区'};
export const SECTORS={industry:'工信类',science:'科技类',market:'市场监管类',hr:'人社类',environment:'生态环境类',emergency:'应急管理类',general:'综合涉企'};
export function beijingDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function quickRange(n,now=new Date()){const end=beijingDay(now),start=new Date(end+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-n+1);return {start:start.toISOString().slice(0,10),end};}
export function dates(start,end){if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw Error('请选择有效起止日期');if(new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start||new Date(end+'T12:00:00Z').toISOString().slice(0,10)!==end)throw Error('日期无效');const out=[];let d=new Date(start+'T12:00:00Z');while(d.toISOString().slice(0,10)<=end){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);if(out.length>36600)throw Error('查询范围最多一百年');}return out;}
export function sourceHealth(source,start,end){const days=dates(start,end),checks=source.checks.filter(c=>c.date>=start&&c.date<=end);if(checks.some(c=>c.status==='error'))return 'error';if(checks.some(c=>c.status==='pending'))return 'pending';return days.every(day=>checks.some(c=>c.date===day&&c.status==='ok'))?'ok':'uncovered';}
export function verifiedDay(n){const d=n.public_date;if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const t=new Date(d+'T12:00:00Z');return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===d;}
export function query(data,filter){const {start,end,q='',level='all',sector='all',type='all'}=filter;dates(start,end);
 const matchingSourceIds=new Set([...data.announcements,...(data.undated_announcements||[])].filter(n=>(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector)).flatMap(n=>n.source_ids));
 const sources=data.sources.filter(s=>matchingSourceIds.has(s.id)||((level==='all'||s.levels.includes(level))&&(sector==='all'||s.sectors.includes(sector)||s.sectors.includes('general'))));
 const sourceIds=new Set(sources.map(s=>s.id));
 const matchesType=n=>type==='all'||n.type===type;
 const matchesSearch=n=>!q||[n.title,n.publisher,LEVELS[n.level],SECTORS[n.sector]].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()));
 const unknown=[...new Map([...(data.undated_announcements||[]),...data.announcements.filter(n=>!verifiedDay(n))].map(n=>[n.id,n])).values()];
 const unresolved=new Set(unknown.flatMap(n=>n.source_ids));
 const undated=unknown.filter(n=>n.source_ids.some(id=>sourceIds.has(id))&&(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector)&&matchesType(n)&&matchesSearch(n));
 const base=data.announcements.filter(n=>verifiedDay(n)&&n.public_date>=start&&n.public_date<=end&&n.source_ids.some(id=>sourceIds.has(id))&&(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector));
 const items=base.filter(n=>matchesType(n)&&matchesSearch(n));
 const websites=[...new Set(sources.map(s=>s.website))];
 const stats={checked:0,updated:0,items:items.length,empty:0,abnormal:0,not_found:0,metadata_pending:undated.length,columns:sources.length,configured:websites.length,column_checked:0,column_updated:0,column_empty:0,column_abnormal:0};
 for(const s of sources){if(s.checks.some(c=>c.date>=start&&c.date<=end))stats.column_checked++;if(items.some(n=>n.source_ids.includes(s.id)))stats.column_updated++;if(sourceHealth(s,start,end)!=='ok')stats.column_abnormal++;else if(!unresolved.has(s.id)&&!base.some(n=>n.source_ids.includes(s.id)))stats.column_empty++;}
 for(const site of websites){const cols=sources.filter(s=>s.website===site),ids=new Set(cols.map(s=>s.id));const checked=cols.some(s=>s.checks.some(c=>c.date>=start&&c.date<=end));const healthy=cols.every(s=>sourceHealth(s,start,end)==='ok');if(checked)stats.checked++;if(items.some(n=>n.source_ids.some(id=>ids.has(id))))stats.updated++;if(!healthy)stats.abnormal++;else if(!cols.some(s=>unresolved.has(s.id))&&!base.some(n=>n.source_ids.some(id=>ids.has(id))))stats.empty++;}
 stats.not_found=stats.configured-stats.updated;
 return {sources,items,stats,undated};}
export function exportCSV(items){const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['官网公开日期','文件发文日期','完整标题','发布部门','类型','官方原文链接','已核实企业申报截止'],...items.map(n=>[n.public_date,n.issue_date||'未明确标注',n.title,displayPublisher(n),n.type==='project'?'项目申报':'涉企政策',n.url,n.deadlines.map(d=>d.phase+':'+d.date+(d.time?' '+d.time:'')).join('；')])];return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}

// Public presentation only: internal check states and date precision stay intact.
export function announcementSections(items){return [['project','项目申报'],['policy','涉企政策']].map(([type,label])=>({type,label,items:items.filter(n=>n.type===type&&verifiedDay(n)),undated:[]})).filter(s=>s.items.length);}
export function columnLabel(name){return name.replace(/（[^）]*(?:待核验|跟踪官方|历史目录|日期独立|原法规库)[^）]*）/g,'');}

function scienceIssuer(value){return !(/未明确|未知|待确认|统一公开|分流/.test(value||''))&&(/(?:^|[、，,\s])(?:南京市)?栖霞区(?:科学技术局|科技局)(?:办公室)?(?:$|[、，,\s（(])/.test((value||'').trim())||/^区科技局$/.test((value||'').trim()));}
export function qixiaCard(n){return scienceIssuer(n.publisher)?'栖霞区科技局':'栖霞区工信、市场监管、人社、环保、应急等部门';}
// Shared district host is a collection location, not an issuing department.
export function departmentGroups(sources,items,undated,level){
 const groups=new Map(),seen=new Set();
 const add=(name,cols)=>{if(!groups.has(name))groups.set(name,{name,cols:[],groupItems:[],unknown:[]});const g=groups.get(name);for(const c of cols)if(!g.cols.some(s=>s.id===c.id))g.cols.push(c);return g;};
 if(level!=='qixia'){
  for(const s of sources)add(s.departments.length>1?(level==='jiangsu'?'江苏省人民政府':level==='nanjing'?'南京市人民政府':'国家综合政策'):s.departments.join('、'),[s]);
  for(const g of groups.values())for(const [rows,key] of [[items,'groupItems'],[undated,'unknown']])for(const n of rows){if(!seen.has(n.id)&&n.source_ids.some(id=>g.cols.some(c=>c.id===id))){g[key].push(n);seen.add(n.id);}}
  return [...groups.values()];
 }
 const science='栖霞区科技局',other='栖霞区工信、市场监管、人社、环保、应急等部门';

 const dedicated=sources.filter(s=>s.departments.length===1&&scienceIssuer(s.departments[0]));
 add(science,dedicated);add(other,sources.filter(s=>!dedicated.some(c=>c.id===s.id)));
 for(const [rows,key] of [[items,'groupItems'],[undated,'unknown']])for(const n of rows){
  if(seen.has(n.id))continue;
  const related=sources.filter(s=>n.source_ids.includes(s.id));if(!related.length)continue;
  seen.add(n.id);
  // Issuer evidence, never a science topic, headline or shared host, controls
  // the science card. The upstream exporter preserves unconfirmed issuers.
  add(qixiaCard(n),related)[key].push(n);
 }
 return [...groups.values()].filter(g=>g.cols.length);
}

// Application eligibility is a separate clock from official publication filters.
export const APPLICATION_LABELS={open:'正在申报',upcoming:'即将开始',closed:'已截止',partial:'部分申报阶段已截止',unknown:'申报状态待确认'};
export function projectStatus(n,review,now=new Date()){
 if(n.type!=='project')return null;
 const a=review?.application;if(!a?.evidence_complete||!a.windows?.length)return 'unknown';
 const day=beijingDay(now);
 const state=w=>{
  if(w.end_date<day)return 'closed';
  if(w.end_date===day){if(!w.end_time)return 'unknown';if(now.getTime()>Date.parse(w.end_date+'T'+w.end_time+'+08:00'))return 'closed';}
  if(!w.start_date)return 'unknown';
  if(w.start_date>day)return 'upcoming';
  if(w.start_date===day){if(!w.start_time)return 'unknown';if(now.getTime()<Date.parse(w.start_date+'T'+w.start_time+'+08:00'))return 'upcoming';}
  return w.end_date?'open':'unknown';
 };
 const states=a.windows.map(state);
 if(a.alternatives){const groups=new Map();a.windows.forEach((w,i)=>{if(!groups.has(w.batch))groups.set(w.batch,[]);groups.get(w.batch).push(states[i]);});if([...groups.values()].some(ss=>ss.every(s=>s==='open')))return 'open';}
 if(states.every(s=>s==='closed'))return 'closed';
 if(states.includes('unknown'))return 'unknown';
 return new Set(states).size===1?states[0]:'partial';
}
export function linkStatusLabel(review){return {unavailable:'官方原文链接暂不可用',restricted:'官方原文访问受限',temporary_error:'官方原文暂时无法访问',content_unconfirmed:'官方页面对应关系待确认',unverified:'官方链接尚未复核',unsafe_redirect:'官方原文跳转尚未核实'}[review?.link?.status]||'';}
export function openArchive(data,filter,now=new Date()){
 const shown=new Set(query(data,filter).items.map(n=>n.id));
 return data.announcements.filter(n=>n.type==='project'&&verifiedDay(n)&&!shown.has(n.id)&&(filter.type||'all')!=='policy'
  &&(filter.level==='all'||!filter.level||n.level===filter.level)&&(filter.sector==='all'||!filter.sector||n.sector===filter.sector)
  &&(!filter.q||[n.title,n.publisher,LEVELS[n.level],SECTORS[n.sector]].some(v=>String(v||'').toLowerCase().includes(filter.q.toLowerCase())))
  &&projectStatus(n,data.announcement_reviews?.[n.id],now)==='open'
  &&!['unavailable','unsafe_redirect','content_unconfirmed'].includes(data.announcement_reviews?.[n.id]?.link?.status));
}

export function enterpriseDeadlineLines(n,review){
 if(n.type!=='project')return [];
 const labels={online:'企业网上申报截止',paper:'企业纸质材料提交截止',submission:'企业材料提交截止'};
 const windows=review?.application?.evidence_complete?review.application.windows:null;
 if(review?.application&&!windows)return [];
 if(windows)return windows.map(w=>(w.batch?w.batch+' · ':'')+(labels[w.phase]||'企业申报截止')+'：'+w.end_date+(w.end_time?' '+w.end_time:''));
 return (n.deadlines||[]).map(d=>(labels[d.phase]||'企业申报截止')+'：'+d.date+(d.time?' '+d.time:''));
}

// Group names are navigation labels; they never replace the actual issuer.
export function displayPublisher(n){return n.level==='qixia'&&(!n.publisher||/未明确|未知|待确认|统一公开|分流/.test(n.publisher))?'发布机构待确认':n.publisher;}
