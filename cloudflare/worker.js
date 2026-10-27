const ORIGIN='https://yuzma-appli.github.io';
const BASE='https://www.lelscanfr.com';
const SERIES='/manga/the-beginning-after-the-end';
const valid=id=>/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(String(id));
const tests=[['fiche',BASE+SERIES+'/'],['chapitre',BASE+SERIES+'/192'],['image',BASE+'/storage/content/the-beginning-after-the-end/192/67b1f2a40eb74.webp']];
async function inspect([nom, url]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, { redirect: 'manual', signal: controller.signal });
    const type = r.headers.get('content-type') || '';
    const result = { test: nom, statutHTTP: r.status, type, accesValide: false };
    if (!r.ok) { await r.body?.cancel(); return result; }
    const reader = r.body?.getReader();
    if (!reader) return { ...result, erreur: 'Reponse vide' };
    const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2 * 1024 * 1024) throw new Error('Reponse superieure a 2 Mio');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    result.octets = total;
    if (nom === 'image') {
      result.accesValide = type.startsWith('image/') && total > 0;
    } else {
      const bytes = new Uint8Array(total); let offset = 0;
      for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
      const html = new TextDecoder().decode(bytes);
      result.titre = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 200);
      const marker = nom === 'fiche' ? '/manga/the-beginning-after-the-end/192' : '/storage/content/the-beginning-after-the-end/192/';
      result.structureAttendue = html.includes(marker);
      result.accesValide = type.includes('text/html') && result.structureAttendue;
    }
    return result;
  } catch (e) { return { test: nom, accesValide: false, erreur: String(e.message) }; }
  finally { clearTimeout(timer); }
}


async function source(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(BASE+path,{redirect:'manual',signal:controller.signal,cf:{cacheTtl:900,cacheEverything:true}});
  if(!r.ok||!(r.headers.get('content-type')||'').includes('text/html')){await r.body?.cancel();throw new Error('Source inaccessible (HTTP '+r.status+')');}
  const reader=r.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Page trop volumineuse');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return new TextDecoder().decode(bytes);
 }finally{clearTimeout(timer);}
}
export function extractChapters(html){
 const ids=new Set();
 for(const a of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
  try{const u=new URL(a[1].replace(/&amp;/g,'&'),BASE),id=u.pathname.slice((SERIES+'/').length).replace(/\/$/,'');
   if(u.origin===BASE&&u.pathname.startsWith(SERIES+'/')&&valid(id)&&!u.search&&!u.hash)ids.add(id);
  }catch{}
 }return [...ids];
}
export function extractPages(html,id='192'){
 const pages=[];
 for(const tag of html.match(/<img\b[^>]*>/gi)||[]){
  const attrs={};for(const a of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g))attrs[a[1].toLowerCase()]=a[3].replace(/&amp;/g,'&');
  for(const key of ['data-src','data-lazy-src','src']){if(!attrs[key])continue;try{const u=new URL(attrs[key],BASE);
   if(u.origin!==BASE||!u.pathname.startsWith('/storage/content/the-beginning-after-the-end/'+id+'/')||! /\.(webp|png|jpe?g)$/i.test(u.pathname)||u.search||u.hash)continue;
   if(!pages.includes(u.href))pages.push(u.href);break;
  }catch{}}
 }return pages;
}
async function catalog(){
 const first=await source(SERIES+'/');
 const numbers=[...first.matchAll(/(?:\?|&amp;|&)page=(\d+)/g)].map(m=>Number(m[1]));
 const last=Math.max(1,...numbers);if(last>10)throw new Error('Pagination de la source non reconnue');
 const htmls=[first];for(let i=2;i<=last;i++)htmls.push(await source(SERIES+'?page='+i));
 const chapters=[...new Set(htmls.flatMap(extractChapters))].sort((a,b)=>Number(a)-Number(b));
 if(!chapters.length)throw new Error('Liste des chapitres non reconnue');
 return {version:3,titre:'The Beginning After the End',chapters,source:BASE+SERIES,updated:new Date().toISOString()};
}
export default{async fetch(request,env,ctx){
 const url=new URL(request.url),headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method!=='GET')return reply({erreur:'GET uniquement'},405);
 if(url.search)return reply({erreur:'Aucun paramètre accepté'},400);
 const origin=request.headers.get('Origin');if(origin&&origin!==ORIGIN)return reply({erreur:'Origine non autorisée'},403);
 const match=url.pathname.match(/^\/chapter\/([^/]+)$/),isCatalog=url.pathname==='/chapters';
 if(!isCatalog&&!match&&!['/','/diagnostic'].includes(url.pathname))return reply({erreur:'Route inconnue'},404);
 if(match&&!valid(match[1]))return reply({erreur:'Chapitre invalide'},400);
 try{
  if(isCatalog||match){
   const key=new Request(url.href),cache=globalThis.caches?.default,cached=cache?await cache.match(key):null;
   if(cached)return cached;
   let data;
   if(isCatalog)data=await catalog();else{const id=match[1],pages=extractPages(await source(SERIES+'/'+id),id);
    if(!pages.length||pages.length>150)throw new Error('Liste des images non reconnue');
    data={version:3,chapitre:id,titre:'The Beginning After the End',source:BASE+SERIES+'/'+id,pages};
   }
   const response=reply(data);response.headers.set('Cache-Control','public, max-age='+(isCatalog?1800:900));
   if(cache&&ctx)ctx.waitUntil(cache.put(key,response.clone()));return response;
  }
  const resultats=[];for(const test of tests)resultats.push(await inspect(test));return reply({diagnostic:'lelscanfr-v3',resultats});
 }catch(e){return reply({erreur:'Lecture de la source impossible',detail:String(e.message)},502);}
}};
