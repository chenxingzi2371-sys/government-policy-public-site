import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {quickRange,query,sourceHealth} from '../search.mjs';
const source=(id,status='ok')=>({id,website:'one.gov.cn',levels:['jiangsu'],sectors:['industry'],checks:[{date:'2026-11-17',status}]});
const item=(id='one',date='2026-11-17')=>({id,title:'工业企业政策',publisher:'江苏省工业和信息化厅',level:'jiangsu',sector:'industry',type:'policy',public_date:date,issue_date:'2026-09-03',source_ids:['a','b']});
const f={start:'2026-11-17',end:'2026-11-17'};
test('BJT quick dates cross UTC day and month safely',()=>{assert.deepEqual(quickRange(3,new Date('2026-11-17T17:00:00Z')),{start:'2026-11-16',end:'2026-11-18'});assert.deepEqual(quickRange(7,new Date('2026-01-02T00:00:00Z')),{start:'2025-12-27',end:'2026-01-02'});});
test('two columns on one website count once; article uses public day not issue date',()=>{const d={sources:[source('a'),source('b')],announcements:[item()]};const r=query(d,f);assert.equal(r.stats.checked,1);assert.equal(r.stats.updated,1);assert.equal(r.stats.items,1);assert.equal(r.stats.columns,2);assert.equal(query(d,{...f,start:'2026-09-03',end:'2026-09-03'}).items.length,0);});
test('error, pending and incomplete date coverage never become no update',()=>{for(const s of ['error','pending'])assert.equal(query({sources:[source('a',s)],announcements:[]},f).stats.empty,0);assert.equal(sourceHealth(source('a'),'2026-11-16','2026-11-17'),'uncovered');});
test('all days required to conclude no update; no search hit is not no website update',()=>{const d={sources:[source('a')],announcements:[item()]};assert.equal(query(d,{...f,q:'不存在'}).stats.empty,0);assert.equal(query({sources:[source('a')],announcements:[]},f).stats.empty,1);});
test('search department region type and date intersect',()=>{const d={sources:[source('a')],announcements:[item()]};assert.equal(query(d,{...f,q:'工信',level:'jiangsu',type:'policy'}).items.length,1);assert.equal(query(d,{...f,level:'qixia'}).items.length,0);assert.equal(query(d,{...f,type:'project'}).items.length,0);});
import {exportCSV} from '../search.mjs';
test('selected metadata CSV retains full titles and official URL; formula text is escaped',()=>{const n={...item(),url:'https://example.gov.cn/a.html',deadlines:[],title:'=HYPERLINK("unsafe")'};const csv=exportCSV([n]);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes(n.url));assert.ok(csv.includes(n.publisher));});
test('undated official notices are visible separately, never counted as date-range additions or no updates',()=>{const n={...item('pending'),public_date:null,public_at:null};const d={sources:[source('a')],announcements:[],undated_announcements:[n]};const r=query(d,f);assert.equal(r.items.length,0);assert.equal(r.undated.length,1);assert.equal(r.stats.items,0);assert.equal(r.stats.empty,0);assert.equal(query(d,{...f,q:'不存在'}).undated.length,0);});
test('project directory includes unconfirmed notices without claiming confirmed deadlines',()=>{const n={...item(),type:'project',deadlines:[]};assert.equal(query({sources:[source('a')],announcements:[n]},{...f,type:'project'}).items.length,1);});
test('actual archive older than ten years remains searchable by official publication date',()=>{const data={sources:[source('a')],announcements:[item('old','2008-11-26'),item('new','2026-11-17')]};const result=query(data,{start:'2008-11-26',end:'2026-11-18'});assert.equal(result.items.length,2);assert.equal(result.stats.items,2);assert.equal(result.stats.empty,0);assert.equal(result.stats.abnormal,1);});
import {announcementSections,columnLabel} from '../search.mjs';
test('19 configured websites minus 11 updated is 8 not found, independent of successful checks',()=>{const sources=Array.from({length:19},(_,i)=>({...source(String(i),i<11?'ok':'error'),website:i+'.gov.cn'}));const announcements=sources.slice(0,11).map((s,i)=>({...item(String(i)),source_ids:[s.id]}));const r=query({sources,announcements},f);assert.equal(r.stats.configured,19);assert.equal(r.stats.updated,11);assert.equal(r.stats.not_found,8);assert.equal(r.stats.empty,0);assert.equal(r.stats.abnormal,8);assert.equal(query({sources,announcements},{...f,q:'不存在'}).stats.not_found,19);});
test('date-range type sections exclude unknown dates, which have their own region',()=>{const p={...item('p'),type:'project'},n=item('n'),u={...item('u'),public_date:null};const sections=announcementSections([p,n],[u]);assert.deepEqual(sections.map(s=>[s.type,s.items.map(n=>n.id),s.undated.map(n=>n.id)]),[['project',['p'],[]],['policy',['n'],[]]]);assert.equal(announcementSections([p]).length,1);assert.deepEqual(announcementSections([]),[]);});
test('public column labels omit internal qualifiers, retaining real column name',()=>{assert.equal(columnLabel('省级部门政府信息公开目录（文件子栏目待核验）'),'省级部门政府信息公开目录');assert.equal(columnLabel('部门文件（含行政规范性文件）'),'部门文件（含行政规范性文件）');});
import {departmentGroups} from '../search.mjs';
test('Qixia shared sources route by official issuer, not host or topic; global notices remain unique',()=>{const s={...source('shared'),departments:['栖霞区政府统一公开栏目（需按发布机构分流）','栖霞区工业和信息化局','栖霞区科学技术局','南京市栖霞区人民政府']};const a={...item('a'),level:'qixia',source_ids:['shared'],publisher:'栖霞区科学技术局'},b={...item('b'),level:'qixia',source_ids:['shared'],publisher:'栖霞区工业和信息化局'},c={...item('c'),level:'qixia',source_ids:['shared'],publisher:'南京市栖霞区人民政府'};const groups=departmentGroups([s],[a,b,c],[],'qixia');assert.equal(groups.find(g=>g.name==='栖霞区科技局').groupItems[0].id,'a');assert.equal(groups.find(g=>g.name==='栖霞区其他涉企部门').groupItems[0].id,'b');assert.equal(groups.flatMap(g=>g.groupItems).length,3);assert.ok(groups.every(g=>!g.name.includes('统一公开')));assert.ok(groups.find(g=>g.name==='栖霞区其他涉企部门').groupItems.some(n=>n.id==='c'));assert.equal(groups.length,2);});

test('shared district source links stay in the composite card without internal labels',()=>{const s={...source('s'),departments:['栖霞区政府统一公开栏目（需按发布机构分流）']};const groups=departmentGroups([s],[],[],'qixia');assert.equal(groups.length,1);assert.equal(groups[0].name,'栖霞区其他涉企部门');assert.equal(groups[0].cols[0].id,'s');});


test('live acceptance preserves both archived and current statistics contracts',async()=>{
 const fs=await import('node:fs');const vm=await import('node:vm');
 const source=fs.readFileSync(new URL('../.github/scripts/verify-live.mjs',import.meta.url),'utf8');
 const fn=source.match(/function statisticsFields\(stats\)\{[^\n]+\}/)[0];
 const evaluate=stats=>JSON.parse(vm.runInNewContext(fn+';JSON.stringify(statisticsFields(stats))',{stats}));
 assert.deepEqual(evaluate({configured:19,checked:0,empty:0,not_found:19}),[['s-sites','configured'],['s-updated','updated'],['s-empty','not_found']]);
 assert.deepEqual(evaluate({configured:19,checked:0,empty:0}),[['s-sites','checked'],['s-updated','updated'],['s-empty','empty']]);
});


test('undated metadata does not turn a collected source into an acquisition failure or a confirmed empty day',()=>{
 const d={sources:[source('a')],announcements:[],undated_announcements:[{...item('u'),public_date:null,public_at:null}]};
 const r=query(d,f);assert.equal(r.stats.column_abnormal,0);assert.equal(r.stats.abnormal,0);assert.equal(r.stats.empty,0);assert.equal(r.stats.metadata_pending,1);assert.equal(r.stats.items,0);assert.equal(r.undated.length,1);
});

test('unconfirmed shared district publisher is not invented as a government or sector bureau',()=>{
 const s={...source('s'),departments:['栖霞区政府统一公开栏目（需按发布机构分流）']};
 const n={...item('u'),source_ids:['s'],level:'qixia',publisher:'发布部门未明确标注',title:'企业环保管理办法'};
 const groups=departmentGroups([s],[n],[],'qixia');
 assert.equal(groups.find(g=>g.groupItems.length).name,'栖霞区其他涉企部门');
 assert.equal(groups.flatMap(g=>g.groupItems).length,1);
});

import {projectStatus,openArchive,enterpriseDeadlineLines,beijingDay} from '../search.mjs';
const asof=new Date('2026-11-23T18:30:00+08:00');
const window=(start,end,phase='online')=>({batch:null,phase,start_date:start,start_time:'09:00',end_date:end,end_time:'18:30'});
const reviewed=(windows,extra={})=>({application:{evidence_complete:true,windows,alternatives:false,...extra},link:{status:'valid'}});
test('expired November 11 official window is neither today nor currently open on November 23',()=>{
 const n={...item('expired','2026-10-27'),type:'project'};const d={sources:[source('a')],announcements:[n],announcement_reviews:{expired:reviewed([window('2026-10-29','2026-11-11')])}};
 assert.equal(query(d,{start:'2026-11-23',end:'2026-11-23'}).items.length,0);assert.equal(projectStatus(n,d.announcement_reviews.expired,asof),'closed');assert.deepEqual(openArchive(d,{start:'2026-11-23',end:'2026-11-23'},asof),[]);
});
test('unknown and invalid official dates never enter any date interval',()=>{
 const bad={...item('bad'),public_date:'2026-11-99'},unknown={...item('unknown'),public_date:null};const d={sources:[source('a')],announcements:[bad],undated_announcements:[unknown]};
 for(const days of [1,3,7,30]){const range=quickRange(days,asof),r=query(d,range);assert.equal(r.items.length,0);assert.equal(r.stats.items,0);assert.equal(r.undated.length,2);assert.equal(announcementSections(r.items,r.undated).length,0);}
});
test('a historical open project stays outside today and has its separate open archive view',()=>{
 const n={...item('open','2026-11-01'),type:'project'};const d={sources:[source('a')],announcements:[n],announcement_reviews:{open:reviewed([window('2026-11-01','2026-11-30')])}};
 const filter={start:'2026-11-23',end:'2026-11-23'};assert.equal(query(d,filter).items.length,0);assert.deepEqual(openArchive(d,filter,asof).map(n=>n.id),['open']);assert.equal(query(d,filter).stats.items,0);
});
test('a true official new project is counted by publication, not by current eligibility',()=>{
 const n={...item('new','2026-11-23'),type:'project'};const d={sources:[source('a')],announcements:[n]};assert.equal(query(d,{start:'2026-11-23',end:'2026-11-23'}).items.length,1);
});
test('application phases do not all close from one closed endpoint; policy has no application status',()=>{
 const n={...item(),type:'project'},r=reviewed([window('2026-11-01','2026-11-11'),window('2026-11-01','2026-11-30','paper')]);assert.equal(projectStatus(n,r,asof),'partial');assert.equal(projectStatus({...n,type:'policy'},r,asof),null);
});
test('verified extension updates the end, while a missing start cannot invent an open opportunity',()=>{
 const n={...item(),type:'project'};assert.equal(projectStatus(n,reviewed([window('2026-11-01','2026-11-30')],{change:'extended'}),asof),'open');const w=window(null,'2026-11-30');w.start_time=null;assert.equal(projectStatus(n,reviewed([w]),asof),'unknown');
});
test('Beijing day and deadline seconds are independent of browser local UTC',()=>{
 const n={...item(),type:'project'},r=reviewed([window('2026-11-01','2026-11-23')]);assert.equal(projectStatus(n,r,asof),'open');assert.equal(projectStatus(n,r,new Date(asof.getTime()+1000)),'closed');assert.equal(beijingDay(new Date('2026-11-23T17:00:00Z')),'2026-11-24');
});
test('policies never show enterprise cutoff lines and explicit batches keep their own deadlines',()=>{
 const n={...item(),type:'policy'};assert.deepEqual(enterpriseDeadlineLines(n,reviewed([window('2026-11-01','2026-11-30')])),[]);const w=window('2026-11-01','2026-11-30');w.batch='第二批';assert.match(enterpriseDeadlineLines({...n,type:'project'},reviewed([w]))[0],/^第二批 · 企业网上申报截止：2026-11-30 18:30$/);
});

test('incomplete current cutoff evidence cannot display a conflicting legacy numeric deadline',()=>{const n={...item(),type:'project',deadlines:[{date:'2026-11-11',time:null,phase:'online'}]};assert.deepEqual(enterpriseDeadlineLines(n,reviewed([],{evidence_complete:false})),[]);});


import {displayPublisher} from '../search.mjs';
test('Qixia merging never routes by science topic or invents an issuer',()=>{
 const sources=[{...source('s'),departments:['栖霞区科学技术局','栖霞区工业和信息化局']}];
 const a={...item('a'),level:'qixia',source_ids:['s'],sector:'science',publisher:'发布机构待确认',title:'关于开展科技研发项目申报的通知'};
 const b={...a,id:'b',publisher:'栖霞区科学技术局'};
 const groups=departmentGroups(sources,[a,b,b],[],'qixia');assert.deepEqual(groups.map(g=>g.name),['栖霞区科技局','栖霞区其他涉企部门']);
 assert.deepEqual(groups[0].groupItems.map(n=>n.id),['b']);assert.deepEqual(groups[1].groupItems.map(n=>n.id),['a']);assert.equal(groups.flatMap(g=>g.groupItems).length,2);
 assert.equal(displayPublisher(a),'发布机构待确认');assert.equal(displayPublisher(b),'栖霞区科学技术局');assert.equal(displayPublisher({...a,level:'jiangsu',publisher:'发布部门未明确标注'}),'发布部门未明确标注');
});
test('all physical district source links survive merging, including empty departments',()=>{
 const sources=['科学技术局','工业和信息化局','市场监督管理局','人力资源和社会保障局','应急管理局'].map((d,i)=>({...source(String(i)),departments:['栖霞区'+d]}));
 const groups=departmentGroups(sources,[],[],'qixia');assert.equal(groups.length,2);assert.deepEqual(new Set(groups.flatMap(g=>g.cols.map(c=>c.id))),new Set(sources.map(s=>s.id)));
});
test('national province and city grouping and original issuer fields are unchanged',()=>{
 const s={...source('s'),departments:['原有部门']},n={...item(),source_ids:['s']};
 for(const level of ['national','jiangsu','nanjing']){const groups=departmentGroups([s],[n],[],level);assert.equal(groups.length,1);assert.equal(groups[0].name,'原有部门');assert.equal(groups[0].groupItems[0],n);}
});

test('a filtered district source set never creates a card with no official source',()=>{const s={...source('m'),departments:['栖霞区市场监督管理局']};const groups=departmentGroups([s],[],[],'qixia');assert.equal(groups.length,1);assert.equal(groups[0].name,'栖霞区其他涉企部门');assert.ok(groups.every(g=>g.cols.length));});

test('verified joint science issuer has priority once; city science and uncertain district guesses do not',()=>{const s={...source('s'),departments:['南京市栖霞区人民政府']};const rows=['栖霞区财政局、栖霞区科学技术局','南京市科学技术局','发布机构待确认 栖霞区科技局'].map((publisher,i)=>({...item(String(i)),level:'qixia',publisher,source_ids:['s']}));const groups=departmentGroups([s],rows,[],'qixia');assert.deepEqual(groups.find(g=>g.name==='栖霞区科技局').groupItems.map(n=>n.id),['0']);assert.equal(groups.find(g=>g.name==='栖霞区其他涉企部门').groupItems.length,2);});
