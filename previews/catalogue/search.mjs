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
 const stats={checked:0,updated:0,items:items.length,empty:0,abnormal:0,columns:sources.length,configured:websites.length,column_checked:0,column_updated:0,column_empty:0,column_abnormal:0};
 for(const s of sources){if(s.checks.some(c=>c.date>=start&&c.date<=end))stats.column_checked++;if(items.some(n=>n.source_ids.includes(s.id)))stats.column_updated++;if((sourceHealth(s,start,end)!=='ok'||unresolved.has(s.id)))stats.column_abnormal++;else if(!base.some(n=>n.source_ids.includes(s.id)))stats.column_empty++;}
 for(const site of websites){const cols=sources.filter(s=>s.website===site),ids=new Set(cols.map(s=>s.id));const checked=cols.some(s=>s.checks.some(c=>c.date>=start&&c.date<=end));const healthy=cols.every(s=>sourceHealth(s,start,end)==='ok'&&!unresolved.has(s.id));if(checked)stats.checked++;if(items.some(n=>n.source_ids.some(id=>ids.has(id))))stats.updated++;if(!healthy)stats.abnormal++;else if(!base.some(n=>n.source_ids.some(id=>ids.has(id))))stats.empty++;}
 return {sources,items,stats,undated};}
export function exportCSV(items){const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['官网公开日期','文件发文日期','完整标题','发布部门','类型','官方原文链接','已核实企业申报截止'],...items.map(n=>[n.public_date,n.issue_date||'未明确标注',n.title,n.publisher,n.type==='project'?'项目申报':'涉企政策',n.url,n.deadlines.map(d=>d.phase+':'+d.date+(d.time?' '+d.time:'')).join('；')])];return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
