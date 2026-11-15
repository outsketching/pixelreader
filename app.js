/* PixelPress: static GitHub Pages PWA, RSS via configurable Cloudflare Worker */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const WORKER_DEFAULT = 'https://rss-proxy.rjmclarenphotography.workers.dev';
const READ_WINDOW = 72 * 3600 * 1000;
const MAX_ENTRIES = 600;
const PRESETS = [
  {id:'ign',name:'IGN',url:'https://feeds.ign.com/ign/all',color:'#ffd772'},
  {id:'pcgamer',name:'PC Gamer',url:'https://www.pcgamer.com/rss/',color:'#b9ead9'},
  {id:'nintendolife',name:'Nintendo Life',url:'https://www.nintendolife.com/feeds/latest',color:'#ffb9cf'},
  {id:'eurogamer',name:'Eurogamer',url:'https://www.eurogamer.net/feed',color:'#b7d5ff'},
  {id:'gamespot',name:'GameSpot',url:'https://www.gamespot.com/feeds/mashup/',color:'#ffe6a8'},
  {id:'kotaku',name:'Kotaku',url:'https://kotaku.com/rss',color:'#dbc6ff'},
  {id:'polygon',name:'Polygon',url:'https://www.polygon.com/rss/index.xml',color:'#c9e9de'},
  {id:'rps',name:'Rock Paper Shotgun',url:'https://www.rockpapershotgun.com/feed/',color:'#ffd0b4'},
  {id:'steamdeckhq',name:'Steam Deck HQ',url:'https://steamdeckhq.com/feed/',color:'#d1e5ff'}
];
const load = (key, fallback) => {try {const x=JSON.parse(localStorage.getItem('pixelpress_'+key));return x ?? fallback;} catch {return fallback;}};
const save = (key, x) => {try {localStorage.setItem('pixelpress_'+key,JSON.stringify(x));} catch(e) {console.warn('Storage unavailable',e);}};
const cleanUrl = (value) => {try {const u = new URL(value);return /^https?:$/.test(u.protocol) ? u.href : '';} catch {return '';}};
const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = html => {const t=document.createElement('template');t.innerHTML=String(html||'');t.content.querySelectorAll('script,style,iframe,svg,object').forEach(n=>n.remove());return (t.content.textContent||'').replace(/\s+/g,' ').trim();};
const icon = (name, px=24) => `<img class="library-pixel-icon" width="${px}" height="${px}" alt="" aria-hidden="true" src="icons/${name}.png" style="width:${px}px;height:${px}px;image-rendering:pixelated">`;
const ago = date => {const d=Date.now()-new Date(date).getTime(); if(!Number.isFinite(d)) return ''; if(d<3600000)return 'Just now';if(d<86400000)return Math.floor(d/3600000)+'h ago';if(d<604800000)return Math.floor(d/86400000)+'d ago';return new Date(date).toLocaleDateString();};
const readableDate = str => {let t=Date.parse(str);return Number.isFinite(t)?new Date(t).toISOString():new Date().toISOString();};
const safeText = x => plain(typeof x==='string'?x: (x?.['#text']||x?.value||x?.text||''));
let worker = load('workerUrl',WORKER_DEFAULT);
let feeds = load('feeds',PRESETS.slice(0,6));
if(!Array.isArray(feeds)) feeds=PRESETS.slice(0,6);
feeds=feeds.filter(f=>f&&cleanUrl(f.url)&&f.name).map(f=>({id:String(f.id||'custom'),name:String(f.name).slice(0,75),url:cleanUrl(f.url),color:f.color||'#d9ecfa'}));
let articles=load('cachedArticles',[]);
if(!Array.isArray(articles))articles=[];
let savedStories=load('savedStories',[]);
if(!Array.isArray(savedStories))savedStories=[];
let readIds=new Set(load('readIds',[]));
let tab='new', search='',listMode=load('listMode',false),busy=false,sourceErrors=[],lastSync=load('lastSync','');
const idFor = article => article.url;
const setMessage = msg => { $('manageMessage').textContent=msg; };
const invalidate = () => {save('feeds',feeds); save('readIds',[...readIds].slice(-2500)); save('savedStories',savedStories);};
const allKnown=()=>{const map=new Map();for(const a of [...articles,...savedStories])if(a?.url)map.set(a.url,a);return [...map.values()];};

function imageFromHtml(html,base){
 const m=String(html||'').match(/<img\b[^>]*\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
 if(!m)return '';try{return cleanUrl(new URL(m[1],base).href);}catch{return '';}
}
function imageFromNode(el,base){
 const candidates=[];
 for(const n of [...el.children]) {
  const tag=n.localName?.toLowerCase();
  if(tag==='thumbnail' || tag==='content' || tag==='enclosure' || tag==='image'){
    candidates.push(n.getAttribute('url'),n.getAttribute('href'),n.querySelector('url')?.textContent);
  }
 }
 const description=xmlText(el,['description','encoded','summary','content']);
 candidates.push(imageFromHtml(description,base));
 for(const x of candidates){try{const src=cleanUrl(new URL(x,base).href);if(src)return src;}catch{}}
 return '';
}
function xmlText(el,names){
 for(const name of names){
  const node=[...el.children].find(x=>x.localName?.toLowerCase()===name.toLowerCase());
  if(node?.textContent?.trim())return node.textContent.trim();
 }
 return '';
}
function rssXmlToItems(raw,feed){
 const doc=new DOMParser().parseFromString(raw,'text/xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid XML returned by proxy');
 const entries=[...doc.querySelectorAll('item, entry')];
 if(!entries.length)throw Error('No RSS or Atom items found');
 return entries.slice(0,70).map(el=>{
  const title=plain(xmlText(el,['title']));
  const atomLink=[...el.children].find(x=>x.localName==='link'&&x.getAttribute('href')&&(x.getAttribute('rel')!=='self'))?.getAttribute('href');
  const link=cleanUrl(atomLink||xmlText(el,['link']));
  const html=xmlText(el,['encoded','description','summary','content']);
  const excerpt=safeText(html).slice(0,600);
  const date=readableDate(xmlText(el,['pubDate','published','updated','date']));
  const image=imageFromNode(el,link||feed.url);
  return {url:link,title,source:feed.id,sourceName:feed.name,date,snippet:excerpt,content:excerpt,image,category:plain(xmlText(el,['category'])).slice(0,48)||'News'};
 }).filter(a=>a.title&&a.url);
}
function jsonToItems(result,feed){
 let list=[];
 if(Array.isArray(result))list=result;
 else if(Array.isArray(result?.items))list=result.items;
 else if(Array.isArray(result?.articles))list=result.articles;
 else if(Array.isArray(result?.entries))list=result.entries;
 else if(typeof result?.xml==='string')return rssXmlToItems(result.xml,feed);
 else if(typeof result?.rss==='string')return rssXmlToItems(result.rss,feed);
 else if(typeof result?.content==='string' && /<rss|<feed|<rdf/i.test(result.content))return rssXmlToItems(result.content,feed);
 else if(typeof result?.body==='string' && /<rss|<feed|<rdf/i.test(result.body))return rssXmlToItems(result.body,feed);
 else if(typeof result?.data==='string' && /<rss|<feed/i.test(result.data))return rssXmlToItems(result.data,feed);
 else if(Array.isArray(result?.data?.items))list=result.data.items;
 if(!list.length)throw Error('Unsupported proxy response (expected RSS XML or articles array)');
 return list.map(item=>{
  const url=cleanUrl(item.link?.href||item.url||item.link||item.guid||'');
  const description=item.content_text||item.content_text_plain||item.content?.text||item.content_html||item.content||item.description||item.summary||item.excerpt||'';
  let image=item.thumbnail?.url||item.image?.url||item.image||item.thumbnail||item.enclosure?.url||item.media?.thumbnail?.url||'';
  if(typeof image !=='string')image='';
  if(!image)image=imageFromHtml(description,url);
  return {url,title:safeText(item.title),source:feed.id,sourceName:feed.name,
    date:readableDate(item.pubDate||item.published||item.date_published||item.isoDate||item.date||item.updated),
    snippet:safeText(item.description||item.summary||item.excerpt||description).slice(0,600),
    content:safeText(description).slice(0,20000),image:cleanUrl(image),category:safeText(item.category||item.categories?.[0]||'News').slice(0,48)||'News'};
 }).filter(x=>x.url&&x.title);
}
async function fetchFeed(feed){
 const base=worker.replace(/\/+$/,'');
 // Common RSS proxy contract: GET /?url=<feed-url>. The provided worker could use a different API.
 const request=new URL(base+'/');request.searchParams.set('url',feed.url);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),16000);
 try{
  const response=await fetch(request.href,{signal:controller.signal,headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/plain, */*'},cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const type=response.headers.get('content-type')||'';
  const raw=await response.text();
  if(/json/i.test(type)||/^[\s]*[\[{]/.test(raw))return jsonToItems(JSON.parse(raw),feed);
  if(/<rss|<feed|<rdf/i.test(raw))return rssXmlToItems(raw,feed);
  throw Error('Proxy returned neither RSS XML nor JSON');
 } catch(e){if(e.name==='AbortError')throw Error('Request timed out');throw e;}finally{clearTimeout(timeout);}
}
function healthy(){
 $('sourceHealth').innerHTML=sourceErrors.map(s=>`<div class="feed-health ${s.error?'fail':'ok'}"><span>${s.error?'✕':'●'}</span><b>${escapeHtml(s.name)}</b> <em>${escapeHtml(s.error||s.count+' stories loaded')}</em></div>`).join('');
}
async function refreshFeeds(){
 if(busy)return;
 if(!feeds.length){articles=[];save('cachedArticles',articles);render();showStatus('Add a feed under Manage to start reading.','warning');return;}
 if(!cleanUrl(worker)){showStatus('Set a valid Cloudflare Worker URL in Manage.','error');return;}
 busy=true; sourceErrors=[]; $('refreshBtn').disabled=true;$('refreshBtn').textContent='↻ Syncing…';
 showStatus('Getting the latest stories from '+feeds.length+' feeds…','');
 const outcome=[];
 // Run small groups to avoid overloading a Free Worker.
 for(let i=0;i<feeds.length;i+=4){
   const part=await Promise.all(feeds.slice(i,i+4).map(async feed=>{
     try{const items=await fetchFeed(feed); sourceErrors.push({name:feed.name,count:items.length});return {feed,items};}
     catch(e){sourceErrors.push({name:feed.name,error:e.message||'Could not load'});return {feed,error:true,items:[]};}
   }));outcome.push(...part);healthy();
 }
 const previous=new Map(articles.map(a=>[a.url,a]));
 const failed=new Set(outcome.filter(o=>o.error).map(o=>o.feed.id));
 const loaded=outcome.flatMap(o=>o.items);
 const seen=new Map();
 for(const a of [...loaded,...articles.filter(a=>failed.has(a.source))]){if(a?.url&&!seen.has(a.url))seen.set(a.url,a);}
 articles=[...seen.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,MAX_ENTRIES);
 if(loaded.length){lastSync=new Date().toISOString();save('lastSync',lastSync);save('cachedArticles',articles);}
 render();healthy();
 const failures=sourceErrors.filter(s=>s.error);
 if(failures.length===feeds.length){showStatus('Could not connect to any RSS feed. The Worker may expect a different API than ?url=, or may not allow browser CORS. See Manage for each feed error. Cached stories are shown if available.','error');}
 else if(failures.length){showStatus('Loaded '+loaded.length+' stories; '+failures.length+' feed'+(failures.length===1?'':'s')+' could not be reached. Check Manage for details.','warning');}
 else{showStatus('Latest stories loaded from '+feeds.length+' feeds.','');setTimeout(()=>{if($('feedStatus').textContent.startsWith('Latest'))$('feedStatus').innerHTML='';},4500);}
 busy=false;$('refreshBtn').disabled=false;$('refreshBtn').innerHTML='<span class="btn-art">↻</span> Refresh';
}
function showStatus(text,kind){$('feedStatus').innerHTML=`<div class="feed-banner ${kind||''}">${escapeHtml(text)}</div>`;}
function filterFor(section){
 let arr=allKnown().filter(a=>a?.title&&a.url&&feeds.some(f=>f.id===a.source));
 if(search)arr=arr.filter(a=>(a.title+' '+a.snippet+' '+a.sourceName).toLowerCase().includes(search.toLowerCase()));
 if(section==='new')arr=arr.filter(a=>Date.now()-Date.parse(a.date)<=READ_WINDOW&&!readIds.has(idFor(a)));
 if(section==='readlater')arr=arr.filter(a=>savedStories.some(s=>s.url===a.url));
 return arr.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
}
function renderCard(article){
 const read=readIds.has(idFor(article)),saved=savedStories.some(s=>s.url===article.url);
 const bg=feeds.find(f=>f.id===article.source)?.color||'#ead8ff';
 const img=article.image?`<img class="article-thumbnail" loading="lazy" decoding="async" src="${escapeHtml(article.image)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:'';
 return `<article class="article-card ${read?'read':''}" data-url="${escapeHtml(article.url)}">
    <div class="thumb" style="background:linear-gradient(135deg,${bg},#fff0f6)">
      ${img}<div class="image-placeholder" style="${article.image?'display:none':''}" aria-label="No thumbnail"><svg viewBox="0 0 64 48" width="46" height="38" fill="none" aria-hidden="true"><rect x="3" y="3" width="58" height="42" rx="2" stroke="currentColor" stroke-width="3"/><circle cx="19" cy="16" r="5" fill="currentColor" opacity=".45"/><path d="M6 39L24 23L34 31L43 20L58 38" stroke="currentColor" stroke-width="3"/></svg><span>NO IMAGE</span></div>
      <span class="source-tag">${icon('controller',14)} ${escapeHtml(article.sourceName)}</span>
    </div>
    <div class="article-body">
      <div class="top-meta"><span class="tag-chip">${escapeHtml(article.category||'News')}</span><span class="time">${escapeHtml(ago(article.date))}</span></div>
      <h4 class="article-title">${escapeHtml(article.title)}</h4><p class="article-snippet">${escapeHtml(article.snippet||'')}</p>
      <div class="article-actions"><div class="action-left"><button class="bookmark-btn ${saved?'saved':''}" aria-pressed="${saved}" aria-label="${saved?'Remove from Read Later':'Save for later'}" title="${saved?'Remove from Read Later':'Save for later'}" data-save="${escapeHtml(article.url)}">${icon(saved?'starFilled':'starOutline',25)}</button><span class="read-state">${read?'READ':'UNREAD'}</span></div><button class="open-btn" data-open="${escapeHtml(article.url)}">READ STORY <span aria-hidden="true">▸</span></button></div>
    </div></article>`;
}
function emptyMarkup(title,subtitle){return `<div class="empty-state"><span class="ico">✧</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(subtitle)}</p></div>`;}
function render(){
 const current=filterFor('new'),later=filterFor('readlater'),all=filterFor('all');
 $('newBadge').textContent=current.length; $('savedBadge').textContent=savedStories.length;
 $('newResultText').textContent=current.length+' unread stories · all subscribed sources';
 $('savedResultText').textContent=later.length+' saved stories'; $('allResultText').textContent=all.length+' available stories';
 for(const [id,arr,title,desc] of [
 ['newGrid',current,'No new stories','Tap Refresh, or open Manage to check your feeds.'],
 ['savedGrid',later,'No saved stories','Tap the star on any article to save it for later.'],
 ['allGrid',all,'No articles yet','Refresh to load RSS news.']]){
  $(id).classList.toggle('list',listMode);
  $(id).innerHTML=arr.length?arr.slice(0,300).map(renderCard).join(''):emptyMarkup(title,desc);
 }
 $('footerDate').textContent=new Date().toLocaleDateString(undefined,{month:'short',day:'numeric'});
 document.querySelectorAll('[data-save]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleSave(btn.dataset.save);}));
 document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openArticle(btn.dataset.open)));
 document.querySelectorAll('.article-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button'))return;openArticle(card.dataset.url);}));
 observeScroll();
}
function toggleSave(url){
 const story=allKnown().find(a=>a.url===url);if(!story)return;
 if(savedStories.some(s=>s.url===url))savedStories=savedStories.filter(s=>s.url!==url);
 else savedStories=[story,...savedStories].slice(0,300);
 invalidate();render();
}
function markRead(url){if(readIds.has(url))return;readIds.add(url);save('readIds',[...readIds].slice(-2500));render();}
let observer=null,seenOnScreen=new Set();
function observeScroll(){
 if(observer)observer.disconnect();seenOnScreen.clear();
 if(tab!=='new'||!('IntersectionObserver'in window))return;
 observer=new IntersectionObserver(entries=>{
  const toRead=[];
  for(const entry of entries){const url=entry.target.dataset.url;if(!url)continue;
   if(entry.isIntersecting)seenOnScreen.add(url);
   else if(seenOnScreen.has(url)&&entry.boundingClientRect.bottom<0&&!readIds.has(url))toRead.push(url);
  }
  if(toRead.length){for(const url of toRead)readIds.add(url);save('readIds',[...readIds].slice(-2500));render();}
 },{threshold:[0,.15]});
 document.querySelectorAll('#newGrid .article-card').forEach(node=>observer.observe(node));
}
function showTab(name){tab=name;document.querySelectorAll('.pixel-tab').forEach(n=>{const on=n.dataset.tab===name;n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false');});document.querySelectorAll('.view-panel').forEach(n=>n.classList.toggle('active',n.id==='view-'+name));render();if(name==='manage')renderManage();}
function openArticle(url){
 const article=allKnown().find(a=>a.url===url);if(!article)return;
 if(!readIds.has(url)){readIds.add(url);save('readIds',[...readIds]);render();}
 const img=article.image?`<img class="modal-image" src="${escapeHtml(article.image)}" alt="" onerror="this.remove()">`:'';
 const body=article.content||article.snippet||'';
 $('modalBody').innerHTML=`<h2 id="modalTitle">${escapeHtml(article.title)}</h2><p class="modal-meta">${escapeHtml(article.sourceName)} · ${escapeHtml(ago(article.date))}</p>${img}
 <div class="reader-note">${body.length>article.snippet.length+100?'Article content supplied by RSS':'Article preview from RSS. The publisher may not supply the full text.'}</div>
 <div class="modal-content"><p class="article-content">${escapeHtml(body||'No article summary available.')}</p></div>
 <a class="out-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open full article ↗</a>`;
 $('articleModal').classList.add('show');$('articleModal').setAttribute('aria-hidden','false');$('closeModalBtn').focus();
}
function closeModal(){$('articleModal').classList.remove('show');$('articleModal').setAttribute('aria-hidden','true');}
function makeId(url){let hash=0;for(const ch of url)hash=(hash*31+ch.charCodeAt(0))|0;return 'custom-'+(hash>>>0).toString(36);}
function addFeed(url){
 url=cleanUrl(url.trim());if(!url){setMessage('Please enter a valid http or https RSS URL.');return;}
 if(feeds.some(f=>f.url===url)){setMessage('That RSS feed is already subscribed.');return;}
 const preset=PRESETS.find(f=>f.url===url);
 const label=preset?.name||new URL(url).hostname.replace(/^www\./,'');
 feeds=[...feeds, preset||{id:makeId(url),url,name:label,color:'#d9ecfa'}];
 save('feeds',feeds);$('feedUrlInput').value='';setMessage(label+' added. Fetching…');renderManage();render();refreshFeeds();
}
function removeFeed(id){const f=feeds.find(x=>x.id===id);feeds=feeds.filter(x=>x.id!==id);save('feeds',feeds);articles=articles.filter(a=>a.source!==id);save('cachedArticles',articles);savedStories=savedStories.filter(a=>a.source!==id);invalidate();setMessage((f?.name||'Feed')+' removed.');renderManage();render();}
function renderManage(){
 $('workerUrlInput').value=worker;
 $('subscriptionList').innerHTML=feeds.length?feeds.map(f=>`<div class="sub-item"><div class="sub-main"><div class="pixel-mini">${icon('internet',22)}</div><div><div class="sub-name">${escapeHtml(f.name)}</div><div class="sub-url">${escapeHtml(f.url)}</div></div></div><div class="sub-actions"><button class="remove-btn" data-remove="${escapeHtml(f.id)}">Remove</button></div></div>`).join(''):emptyMarkup('No feeds','Add one from the popular feeds list.');
 $('popularList').innerHTML=PRESETS.map(f=>{const exists=feeds.some(x=>x.url===f.url);return `<div class="popular-item"><div class="sub-main"><div class="pixel-mini">${icon('controller',22)}</div><div><div class="sub-name">${escapeHtml(f.name)}</div></div></div><button class="${exists?'ghost-btn':'add-btn'}" ${exists?'disabled':''} data-quick="${escapeHtml(f.id)}">${exists?'Added':'Add'}</button></div>`;}).join('');
 document.querySelectorAll('[data-remove]').forEach(n=>n.onclick=()=>removeFeed(n.dataset.remove));
 document.querySelectorAll('[data-quick]').forEach(n=>n.onclick=()=>{const f=PRESETS.find(x=>x.id===n.dataset.quick);if(f)addFeed(f.url);});
 healthy();
}
function saveWorker(){let value=$('workerUrlInput').value.trim();let parsed=cleanUrl(value);if(!parsed){setMessage('Enter a valid HTTPS Worker URL.');return;} worker=parsed;save('workerUrl',worker);setMessage('Worker URL saved. Refreshing feeds…');refreshFeeds();}
// Initial state and navigation.
document.querySelectorAll('[data-pixel]').forEach(el=>{const key=el.dataset.pixel;el.innerHTML=icon(key,el.closest('.brand-icon')?32:el.classList.contains('toolbar-icon')?28:19);});
document.querySelectorAll('.pixel-tab').forEach(n=>n.onclick=()=>showTab(n.dataset.tab));
$('jumpManageBtn').onclick=()=>showTab('manage');
$('searchInput').addEventListener('input',e=>{search=e.target.value.trim();render();});
$('refreshBtn').onclick=refreshFeeds;
$('layoutBtn').onclick=()=>{listMode=!listMode;save('listMode',listMode);$('layoutBtn').textContent=listMode?'▦ Grid':'▤ List';render();};
$('layoutBtn').textContent=listMode?'▦ Grid':'▤ List';
$('closeModalBtn').onclick=closeModal;
$('articleModal').onclick=e=>{if(e.target===$('articleModal'))closeModal();};
$('saveWorkerBtn').onclick=saveWorker;
$('addFeedBtn').onclick=()=>addFeed($('feedUrlInput').value);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName)){e.preventDefault();$('searchInput').focus();}});
renderManage();showTab('new');showStatus(articles.length?'Showing cached headlines while feeds refresh…':'Connecting to your news feeds…','');refreshFeeds();
if('serviceWorker'in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
})();
