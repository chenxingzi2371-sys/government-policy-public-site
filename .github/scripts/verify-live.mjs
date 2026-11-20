// Public-only anonymous acceptance. Deployed as .github/scripts/verify-live.mjs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {query}=await import(new URL(process.env.SITE_SEARCH_MODULE||'../../search.mjs',import.meta.url));
// Archived previews retain their original statistics contract.
function statisticsFields(stats){return [['s-sites',Object.hasOwn(stats,'not_found')?'configured':'checked'],['s-updated','updated'],['s-empty',Object.hasOwn(stats,'not_found')?'not_found':'empty']];}
const base=process.env.SITE_URL;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
assert.ok(base?.startsWith('https://'),'HTTPS site URL required');
const output=process.env.SITE_RESULTS_DIR||'live-verification';fs.mkdirSync(output,{recursive:true});
const response=await fetch(new URL('data/public.json',base),{credentials:'omit'});
assert.equal(response.status,200);
const data=await response.json();const strictCatalogue=data.schema_version===2;assert.ok([1,2].includes(data.schema_version));assert.deepEqual(data,JSON.parse(fs.readFileSync(process.env.SITE_DATA_FILE||'data/public.json')),'Served data must match the deployed snapshot');
assert.equal(new Set(data.announcements.map(n=>n.id)).size,data.announcements.length);
const results={url:base,anonymous:true,data_http:200,data_records:data.announcements.length,configured_websites:new Set(data.sources.map(s=>s.website)).size,configured_columns:data.sources.length,viewports:[]};
const browser=await chromium.launch();
try{
 for(const [width,height,name] of [[1440,1050,'desktop'],[390,844,'mobile'],[320,780,'small-mobile']]){
  const context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const visit=await page.goto(base);assert.equal(visit.status(),200);
  await page.locator('#s-sites').filter({hasText:/\d/}).waitFor();
  const checks=[];
  for(const days of [1,3,7,30]){
   await page.locator(`[data-days="${days}"]`).click();
   const start=await page.locator('#start').inputValue(),end=await page.locator('#end').inputValue();
   const actualDays=(Date.parse(end)-Date.parse(start))/86400000+1;assert.equal(actualDays,days);
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(end,today);
   const expected=data.announcements.filter(n=>n.public_date>=start&&n.public_date<=end);
   assert.equal(Number(await page.locator('#s-items').innerText()),expected.length);
   assert.equal(await page.locator('.item-name').count(),expected.length);
   const stats=query(data,{start,end}).stats;
   for(const [id,key] of statisticsFields(stats))assert.equal(Number(await page.locator('#'+id).innerText()),stats[key]);
   for(const n of expected){const matches=await page.locator('a.item-name').evaluateAll((es,n)=>es.filter(e=>e.textContent===n.title&&e.getAttribute('href')===n.url).length,n);assert.equal(matches,1);}
   checks.push({range:days===1?'today':`last_${days}_days`,start,end,records:expected.length,statistics:stats});
  }
  await page.locator('#start').fill('2026-11-17');await page.locator('#end').fill('2026-11-17');await page.locator('#apply').click();
  const custom=data.announcements.filter(n=>n.public_date==='2026-11-17');assert.equal(Number(await page.locator('#s-items').innerText()),custom.length);
  checks.push({range:'custom',start:'2026-11-17',end:'2026-11-17',records:custom.length});
  // Broad initial history: inspect all published members and all original links.
  const recentStart=new Date(today+'T12:00:00Z');recentStart.setUTCDate(recentStart.getUTCDate()-29);const earliest=recentStart.toISOString().slice(0,10);await page.locator('#start').fill(earliest);await page.locator('#end').fill(today);await page.locator('#apply').click();
  for(const sector of ['industry','science','market','hr','environment','emergency']){
   await page.locator('#sector').selectOption(sector);const expected=data.announcements.filter(n=>n.sector===sector&&n.public_date>=earliest&&n.public_date<=today);assert.equal(Number(await page.locator('#s-items').innerText()),expected.length);
  }
  await page.locator('#sector').selectOption('all');
  for(const level of ['national','jiangsu','nanjing','qixia']){await page.locator('#level').selectOption(level);assert.equal(Number(await page.locator('#s-items').innerText()),data.announcements.filter(n=>n.level===level&&n.public_date>=earliest&&n.public_date<=today).length);}
  await page.locator('#level').selectOption('all');
  const all=data.announcements.filter(n=>n.public_date>=earliest&&n.public_date<=today);
  for(const n of all){const anchors=await page.locator('a.item-name').filter({hasText:n.title}).all();const matches=[];for(const a of anchors){if(await a.getAttribute('href')===n.url)matches.push(a);}assert.equal(matches.length,1);assert.equal(await matches[0].innerText(),n.title);assert.equal(await matches[0].getAttribute('target'),'_blank');assert.ok(new URL(n.url).hostname.endsWith('.gov.cn'));}
  assert.equal(await page.locator('.undated-name').count(),(data.undated_announcements||[]).length);
  assert.deepEqual(await page.locator('#type option').evaluateAll(es=>es.map(e=>e.value)),['all','project','policy']);
  const expectedColumns=new Map(data.sources.map(s=>[s.url,s.name]));
  const columnLinks=await page.locator('a.column-link').all();if(strictCatalogue){assert.deepEqual(new Set(await page.locator('a.column-link').evaluateAll(es=>es.map(e=>e.getAttribute('href')))),new Set(data.sources.map(s=>s.url)));
  assert.equal(await page.getByRole('link',{name:'官方栏目 ↗',exact:true}).count(),0);
  for(const a of columnLinks){assert.ok((await a.textContent())&&expectedColumns.has(await a.getAttribute('href')));assert.equal(await a.getAttribute('target'),'_blank');}
  await page.locator('.column-details summary').first().click();assert.ok(await page.locator('a.column-link').first().isVisible());
  }
  for(const area of await page.locator('.announcement-section').all()){
   assert.notEqual(await area.getAttribute('open'),null);
   const type=await area.getAttribute('data-type');
   for(const id of await area.locator('.item-name').evaluateAll(es=>es.map(e=>e.dataset.noticeId)))assert.equal(data.announcements.find(n=>n.id===id).type,type);
   await area.locator('summary').click();assert.equal(await area.getAttribute('open'),null);await area.locator('summary').click();
  }
  assert.equal(await page.locator('.issue-date').count(),all.filter(n=>n.issue_date).length+(data.undated_announcements||[]).filter(n=>n.issue_date).length);
  assert.equal(Number(await page.locator('#s-sites').innerText()),Number(await page.locator('#s-updated').innerText())+Number(await page.locator('#s-empty').innerText()));
  for(const phrase of ['待核验','覆盖不足','正文未核验','附件未核验'])assert.ok(!(await page.locator('main').innerText()).includes(phrase));
  for(const a of await page.locator('a.home').all()){const u=new URL(await a.getAttribute('href'));assert.ok(['http:','https:'].includes(u.protocol)&&u.hostname.endsWith('.gov.cn'));}
  if(name==='desktop'){
   const target=all[0];const popupReady=page.waitForEvent('popup');await page.locator('a.item-name').filter({hasText:target.title}).first().click();const popup=await popupReady;
   let http=null,error=null;try{const r=await popup.waitForResponse(r=>r.request().isNavigationRequest(),{timeout:15000});http=r.status();}catch(e){error='navigation_response_not_observed';}
   results.article_click={requested_url:target.url,popup_url:popup.url(),http_status:http,observation:error};await popup.close();
   const home=page.locator('a.home').first(),homeTarget=await home.getAttribute('href');const homeReady=page.waitForEvent('popup');await home.click();const homePage=await homeReady;
   try{await homePage.waitForLoadState('domcontentloaded',{timeout:15000});}catch{}results.home_click={requested_url:homeTarget,popup_url:homePage.url()};await homePage.close();
  }
  const first=all[0];await page.locator('#search').fill(first.publisher);assert.ok(Number(await page.locator('#s-items').innerText())>0);await page.locator('#search').fill('不存在的关键字验收');assert.equal(await page.locator('#s-items').innerText(),'0');await page.locator('#search').fill('');
  await page.locator('#type').selectOption('project');assert.equal(Number(await page.locator('#s-items').innerText()),all.filter(n=>n.type==='project').length);await page.locator('#type').selectOption('policy');assert.equal(Number(await page.locator('#s-items').innerText()),all.filter(n=>n.type==='policy').length);await page.locator('#type').selectOption('all');
  assert.ok(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await page.waitForFunction(expected=>{const e=document.querySelector('.sources');return e&&getComputedStyle(e).gridTemplateColumns.split(' ').length===expected},width>760?2:1);
  const cols=await page.locator('.sources').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(cols,width>760?2:1);
  await page.locator('[data-days="30"]').click();await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
  assert.deepEqual(errors,[]);results.viewports.push({name,width,columns:cols,checks,department_filters:'passed',region_filters:'passed',search:'passed',type:'passed',official_title_links_checked:all.length,column_name_links:columnLinks.length,official_home_links:'passed',overflow:false,js_errors:errors});
  await context.close();
 }
}finally{await browser.close();}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2)+'\n');
console.log('LIVE_ANONYMOUS_BROWSER_VERIFIED='+JSON.stringify(results));
