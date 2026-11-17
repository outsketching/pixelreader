/* Optional replacement for an existing Cloudflare Worker.
   API: GET /?url=https%3A%2F%2Fexample.org%2Ffeed.xml
   Returns raw RSS/Atom XML with CORS enabled for use by PixelPress on GitHub Pages.
   Configure ALLOWED_ORIGIN in Cloudflare to your exact GitHub Pages origin to restrict access.
*/
const ALLOWED_ORIGIN='*'; // For personal use. Change to https://USERNAME.github.io when deployed.
const HEADERS={
  'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Accept',
  'Vary':'Origin',
  'X-Content-Type-Options':'nosniff',
};
const failure=(msg,status=400)=>new Response(msg,{status,headers:{...HEADERS,'Content-Type':'text/plain; charset=utf-8'}});
function blockTarget(host){
 const h=host.toLowerCase();
 return h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||
   /^(\d{1,3}\.){3}\d{1,3}$/.test(h)|| h.includes(':') || h==='0' || h.startsWith('127.');
}

// Expanded reader: extract readable, publisher-supplied HTML via HTMLRewriter.
// This is best-effort and does not bypass publisher restrictions or paywalls.
function articleTarget(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(!['https:','http:'].includes(u.protocol)||blockTarget(u.hostname)||u.username||u.password)return null;
 return u;
}
const ARTICLE_ROOTS=[
 '[itemprop="articleBody"]',
 '.article-body', '.article__body', '.article-content',
 '.article__content', '.entry-content', '.post-content',
 '.story-body', '.story__body', '.content-body',
 '.article-text', '.article-copy', '.news-article',
 'main article', 'article'
];
class BlockCollector {
 constructor(blocks,type){this.blocks=blocks;this.type=type;this.stack=[];}
 element(el){
  const record={type:this.type,text:''};this.stack.push(record);
  el.onEndTag(()=>{
   this.stack.pop();
   record.text=record.text.replace(/\s+/g,' ').trim();
   if(record.text.length>25 && this.blocks.length<180 && !/^(advertisement|share this|subscribe to|read more:|related articles|sign up)/i.test(record.text))this.blocks.push(record);
  });
 }
 text(chunk){if(this.stack.length)this.stack[this.stack.length-1].text+=chunk.text;}
}
async function extractArticle(response){
 const candidates=ARTICLE_ROOTS.map(root=>({root,blocks:[]}));
 let rewriter=new HTMLRewriter();
 for(const candidate of candidates){
  for(const [tag,type] of [['p','p'],['h2','h2'],['h3','h3'],['blockquote','quote'],['li','li']]){
   rewriter=rewriter.on(candidate.root+' '+tag,new BlockCollector(candidate.blocks,type));
  }
 }
 // HTMLRewriter's streaming handlers run while the response body is consumed.
 await rewriter.transform(response).arrayBuffer();
 let winner=null,score=-1;
 for(const candidate of candidates){
  // Strongly prefer specific article containers over main/article fallbacks.
  const useful=candidate.blocks.filter(x=>x.type==='p'&&x.text.length>45).reduce((n,x)=>n+x.text.length,0);
  const total=candidate.blocks.reduce((n,x)=>n+x.text.length,0);
  const value=useful + Math.min(1200,total-useful)*.3;
  if(value>score){score=value;winner=candidate;}
 }
 if(!winner||score<120)return null;
 const blocks=winner.blocks.slice(0,150);
 let length=0;
 const limited=[];
 for(const block of blocks){if(length>=85000)break;limited.push({type:block.type,text:block.text.slice(0,6000)});length+=block.text.length;}
 return {blocks:limited,characters:length,root:winner.root};
}

export default {
 async fetch(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(request.method!=='GET')return failure('Only GET is supported',405);
  const url=new URL(request.url), target=url.searchParams.get('url');
  const image=url.searchParams.get('image');
  const article=url.searchParams.get('article');
  if(article){
   const targetArticle=articleTarget(article);
   if(!targetArticle)return failure('Invalid article URL');
   const key=new Request(url.href,{method:'GET'});
   const cached=await caches.default.match(key);
   if(cached)return cached;
   try{
    const upstream=await fetch(targetArticle.href,{
      headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 (compatible; PixelPressReader/1.0)'},
      redirect:'follow',signal:AbortSignal.timeout(14000)
    });
    if(!upstream.ok)return failure('Publisher returned HTTP '+upstream.status,502);
    const kind=(upstream.headers.get('content-type')||'').toLowerCase();
    if(!kind.includes('text/html')&&!kind.includes('application/xhtml+xml'))return failure('Publisher did not return an HTML article',502);
    const size=Number(upstream.headers.get('content-length')||0);
    if(size>3_500_000)return failure('Article HTML too large',413);
    const raw=(await upstream.text()).slice(0,3_500_000);
    const extracted=await extractArticle(new Response(raw,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
    if(!extracted)return failure('Readable article text not found',422);
    const result=new Response(JSON.stringify(extracted),{
      status:200,headers:{...HEADERS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=900'}
    });
    ctx.waitUntil(caches.default.put(key,result.clone()));
    return result;
   }catch(e){return failure('Article extraction failed: '+String(e?.message||e),502);}
  }

  if(image){
   let remoteImage;try{remoteImage=new URL(image);}catch{return failure('Invalid image URL');}
   if(!['https:','http:'].includes(remoteImage.protocol)||blockTarget(remoteImage.hostname)||remoteImage.username||remoteImage.password)return failure('Image URL not permitted');
   try{
    const upstream=await fetch(remoteImage.href,{headers:{'Accept':'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(11000)});
    const kind=(upstream.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(!upstream.ok||!['image/jpeg','image/png','image/webp','image/avif','image/gif'].includes(kind))return failure('Image unavailable',502);
    const size=Number(upstream.headers.get('content-length')||0);
    if(size>5_000_000)return failure('Image too large',413);
    const bytes=await upstream.arrayBuffer();if(bytes.byteLength>5_000_000)return failure('Image too large',413);
    return new Response(bytes,{headers:{...HEADERS,'Content-Type':kind,'Cache-Control':'public, max-age=3600'}});
   }catch{return failure('Image fetch failed',502);}
  }
  if(!target)return failure('Specify ?url=<feed>, ?image=<image>, or ?article=<article>');
  let remote;try{remote=new URL(target);}catch{return failure('Invalid feed URL');}
  if(!['https:','http:'].includes(remote.protocol)||blockTarget(remote.hostname)||remote.username||remote.password)return failure('Feed URL is not permitted');
  const cfCache=caches.default;
  const key=new Request(url.href,{method:'GET'});
  const cached=await cfCache.match(key);
  if(cached)return cached;
  try{
   const upstream=await fetch(remote.href,{headers:{'Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*','User-Agent':'PixelPressRSS/1.0'},redirect:'follow',signal:AbortSignal.timeout(11000)});
   if(!upstream.ok)return failure('Upstream feed HTTP '+upstream.status,502);
   const length=Number(upstream.headers.get('content-length')||0);
   if(length>2_000_000)return failure('Feed too large',413);
   const text=(await upstream.text()).slice(0,2_000_000);
   if(!/<rss\b|<feed\b|<rdf:RDF\b|^\s*\{/.test(text))return failure('Upstream did not return RSS/Atom/JSON feed',502);
   const response=new Response(text,{status:200,headers:{...HEADERS,'Content-Type':text.trimStart().startsWith('{')?'application/json; charset=utf-8':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
   ctx.waitUntil(cfCache.put(key,response.clone()));
   return response;
  }catch(e){return failure('Fetch failed: '+String(e?.message||e),502);}
 }
};
