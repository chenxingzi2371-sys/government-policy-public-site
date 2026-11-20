export const LEVELS={national:'国家',jiangsu:'江苏省',nanjing:'南京市',qixia:'栖霞区'};
export const SECTORS={industry:'工信类',science:'科技类',market:'市场监管类',hr:'人社类',environment:'生态环境类',emergency:'应急管理类',general:'综合涉企'};
export function beijingDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function quickRange(n,now=new Date()){const end=beijingDay(now),start=new Date(end+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-n+1);return {start:start.toISOString().slice(0,10),end};}
export function dates(start,end){if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw Error('请选择有效起止日期');if(new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start||new Date(end+'T12:00:00Z').toISOString().slice(0,10)!==end)throw Error('日期无效');const out=[];let d=new Date(start+'T12:00:00Z');while(d.toISOString().slice(0,10)<=end){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);if(out.length>36600)throw Error('查询范围最多一百年');}return out;}
export function sourceHealth(source,start,end){const days=dates(start,end),checks=source.checks.filter(c=>c.date>=start&&c.date<=end);if(checks.some(c=>c.status==='error'))return 'error';if(checks.some(c=>c.status==='pending'))return 'pending';return days.every(day=>checks.some(c=>c.date===day&&c.status==='ok'))?'ok':'uncovered';}
export function query(data,filter){const {start,end,q='',level='all',sector='all',type='all'}=filter;dates(start,end);
 const matchingSourceIds=new Set([...data.announcements,...(data.undated_announcements||[])].filter(n=>(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector)).flatMap(n=>n.source_ids));
 const sources=data.sources.filter(s=>matchingSourceIds.has(s.id)||((level==='all'||s.levels.includes(level))&&(sector==='all'||s.sectors.includes(sector)||s.sectors.includes('general'))));
 const sourceIds=new Set(sources.map(s=>s.id));
 const matchesType=n=>type==='all'||n.type===type;
 const matchesSearch=n=>!q||[n.title,n.publisher,LEVELS[n.level],SECTORS[n.sector]].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()));
 const unresolved=new Set((data.undated_announcements||[]).flatMap(n=>n.source_ids));
 const undated=(data.undated_announcements||[]).filter(n=>n.source_ids.some(id=>sourceIds.has(id))&&(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector)&&matchesType(n)&&matchesSearch(n));
 const base=data.announcements.filter(n=>n.public_date>=start&&n.public_date<=end&&n.source_ids.some(id=>sourceIds.has(id))&&(level==='all'||n.level===level)&&(sector==='all'||n.sector===sector));
 const items=base.filter(n=>matchesType(n)&&matchesSearch(n));
 const websites=[...new Set(sources.map(s=>s.website))];
 const stats={checked:0,updated:0,items:items.length,empty:0,abnormal:0,not_found:0,columns:sources.length,configured:websites.length,column_checked:0,column_updated:0,column_empty:0,column_abnormal:0};
 for(const s of sources){if(s.checks.some(c=>c.date>=start&&c.date<=end))stats.column_checked++;if(items.some(n=>n.source_ids.includes(s.id)))stats.column_updated++;if((sourceHealth(s,start,end)!=='ok'||unresolved.has(s.id)))stats.column_abnormal++;else if(!base.some(n=>n.source_ids.includes(s.id)))stats.column_empty++;}
 for(const site of websites){const cols=sources.filter(s=>s.website===site),ids=new Set(cols.map(s=>s.id));const checked=cols.some(s=>s.checks.some(c=>c.date>=start&&c.date<=end));const healthy=cols.every(s=>sourceHealth(s,start,end)==='ok'&&!unresolved.has(s.id));if(checked)stats.checked++;if(items.some(n=>n.source_ids.some(id=>ids.has(id))))stats.updated++;if(!healthy)stats.abnormal++;else if(!base.some(n=>n.source_ids.some(id=>ids.has(id))))stats.empty++;}
 stats.not_found=stats.configured-stats.updated;
 return {sources,items,stats,undated};}
export function exportCSV(items){const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['官网公开日期','文件发文日期','完整标题','发布部门','类型','官方原文链接','已核实企业申报截止'],...items.map(n=>[n.public_date,n.issue_date||'未明确标注',n.title,n.publisher,n.type==='project'?'项目申报':'涉企政策',n.url,n.deadlines.map(d=>d.phase+':'+d.date+(d.time?' '+d.time:'')).join('；')])];return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}

// Public presentation only: internal check states and date precision stay intact.
export function announcementSections(items,undated=[]){return [['project','项目申报'],['policy','涉企政策']].map(([type,label])=>({type,label,items:items.filter(n=>n.type===type),undated:undated.filter(n=>n.type===type)})).filter(s=>s.items.length||s.undated.length);}
export function columnLabel(name){return name.replace(/（[^）]*(?:待核验|跟踪官方|历史目录|日期独立|原法规库)[^）]*）/g,'');}

// Shared district host is a collection location, not an issuing department.
export function departmentGroups(sources,items,undated,level){
 const groups=new Map(),seen=new Set();
 const add=(name,cols)=>{if(!groups.has(name))groups.set(name,{name,cols:[],groupItems:[],unknown:[]});const g=groups.get(name);for(const c of cols)if(!g.cols.some(s=>s.id===c.id))g.cols.push(c);return g;};
 if(level!=='qixia'){
  for(const s of sources)add(s.departments.length>1?(level==='jiangsu'?'江苏省人民政府':level==='nanjing'?'南京市人民政府':'国家综合政策'):s.departments.join('、'),[s]);
  for(const g of groups.values())for(const [rows,key] of [[items,'groupItems'],[undated,'unknown']])for(const n of rows){if(!seen.has(n.id)&&n.source_ids.some(id=>g.cols.some(c=>c.id===id))){g[key].push(n);seen.add(n.id);}}
  return [...groups.values()];
 }
 const normal=s=>s.replace(/^南京市/,'').replace(/人力资源和社会保障/g,'人力资源社会保障').replace(/经济和信息化/g,'工业和信息化');
 for(const s of sources){const names=s.departments.filter(name=>!/统一公开|分流/.test(name));for(const name of names.length?names:['南京市栖霞区人民政府'])add(name,[s]);}
 const aliases={'区工信局':'栖霞区工业和信息化局','区科技局':'栖霞区科学技术局','区应急管理局':'栖霞区应急管理局','区市场监管局':'南京市栖霞区市场监督管理局','区人社局':'南京市栖霞区人力资源和社会保障局','栖霞生态环境局':'南京市栖霞生态环境局'};
 for(const [rows,key] of [[items,'groupItems'],[undated,'unknown']])for(const n of rows){
  if(seen.has(n.id))continue;seen.add(n.id);
  const related=sources.filter(s=>n.source_ids.includes(s.id));if(!related.length)continue;
  const pub=n.publisher||'',certain=pub&&!/未明确|未知|待确认/.test(pub);
  let name=[...groups.keys()].sort((a,b)=>b.length-a.length).find(d=>certain&&normal(pub).includes(normal(d)));
  if(!name){const text=certain?pub:n.title;const alias=Object.keys(aliases).find(a=>text.includes(a));if(alias)name=aliases[alias];}
  if(!name&&!certain)name=[...groups.keys()].find(d=>n.title.startsWith(d+'关于'));
  if(!name)name=certain&&!/统一公开|分流/.test(pub)?pub:'南京市栖霞区人民政府';
  add(name,related)[key].push(n);
 }
 return [...groups.values()];
}
