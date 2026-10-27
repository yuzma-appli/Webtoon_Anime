const ORIGIN='https://yuzma-appli.github.io',BASE='https://www.lelscanfr.com',DEFAULT='the-beginning-after-the-end';
const valid=id=>/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(String(id));
const slugOK=s=>/^[a-z0-9][a-z0-9-]{0,119}$/.test(s)&&s!=='random';
const tests=[['fiche',BASE+'/manga/'+DEFAULT+'/'],['chapitre',BASE+'/manga/'+DEFAULT+'/192'],['image',BASE+'/storage/content/'+DEFAULT+'/192/67b1f2a40eb74.webp']];
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

export function decode(s){const map={amp:'&',quot:'"',apos:"'",nbsp:' ',eacute:'é',egrave:'è',ecirc:'ê',euml:'ë',agrave:'à',acirc:'â',auml:'ä',ocirc:'ô',ouml:'ö',ugrave:'ù',ucirc:'û',uuml:'ü',icirc:'î',iuml:'ï',ccedil:'ç',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',hellip:'…',ndash:'–',mdash:'—',oelig:'œ',Eacute:'É',Agrave:'À'};return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,k)=>{if(k[0]==='#'){const n=k[1]==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return map[k]??all;});}
const text=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
function attrs(tag){const a={};for(const m of tag.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=decode(m[3]);return a;}
function coverURL(src){try{const u=new URL(src,BASE);return u.origin===BASE&&u.pathname.startsWith('/storage/covers/')&&!u.search?u.href:null;}catch{return null;}}
export function extractTitles(html){const entries=new Map();for(const m of html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)){const a=attrs(m[1]);if(!a.href)continue;try{const u=new URL(a.href,BASE),id=u.pathname.match(/^\/manga\/([a-z0-9-]+)\/?$/)?.[1];if(u.origin!==BASE||!id||!slugOK(id)||u.search)continue;const tag=m[2].match(/<img\b[^>]*>/i);if(!tag)continue;const img=attrs(tag[0]),cover=coverURL(img['data-src']||img.src||'');if(!cover)continue;const title=(img.alt||text(m[2].match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)?.[1]||'')).trim().slice(0,150);if(!title)continue;entries.set(id,{slug:id,title,cover});}catch{}}return [...entries.values()];}
export function extractChapters(html,slug=DEFAULT){const ids=new Set();for(const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){try{const u=new URL(decode(m[1]),BASE),prefix='/manga/'+slug+'/',id=u.pathname.slice(prefix.length).replace(/\/$/,'');if(u.origin===BASE&&u.pathname.startsWith(prefix)&&valid(id)&&!u.search&&!u.hash)ids.add(id);}catch{}}return [...ids];}
export function extractPages(html,id='192',slug=DEFAULT){const pages=[];for(const tag of html.match(/<img\b[^>]*>/gi)||[]){const a=attrs(tag);for(const key of ['data-src','data-lazy-src','src']){if(!a[key])continue;try{const u=new URL(a[key],BASE);if(u.origin!==BASE||!u.pathname.startsWith('/storage/content/'+slug+'/'+id+'/')||! /\.(webp|png|jpe?g)$/i.test(u.pathname)||u.search||u.hash)continue;if(!pages.includes(u.href))pages.push(u.href);break;}catch{}}}return pages;}
function pageCount(html){return Math.max(1,...[...html.matchAll(/(?:\?|&amp;|&)page=(\d+)/g)].map(m=>Number(m[1])));}
export async function catalog(slug){const path='/manga/'+slug,first=await source(path+'/'),last=pageCount(first);if(last>30)throw new Error('La source contient trop de pages de chapitres pour ce lecteur.');const htmls=[first];for(let i=2;i<=last;i+=3){const batch=[];for(let j=i;j<=Math.min(i+2,last);j++)batch.push(source(path+'?page='+j));htmls.push(...await Promise.all(batch));}
 const chapters=[...new Set(htmls.flatMap(h=>extractChapters(h,slug)))].sort((a,b)=>Number(a)-Number(b));if(!chapters.length)throw new Error('Liste des chapitres non reconnue');
 let image;for(const tag of first.match(/<img\b[^>]*>/gi)||[]){const a=attrs(tag);if(coverURL(a.src||a['data-src']||'')){image=a;break;}}
 const title=image?.alt||text(first.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||slug.replaceAll('-',' '));
 const description=text(first.match(/<p\b[^>]*id=["']description["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]||'').slice(0,900);
 const genres=[...first.matchAll(/<a\b[^>]*href=["'][^"']*\/manga\?genre=[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1])).slice(0,6);
 return {version:4,slug,title,cover:coverURL(image?.src||image?.['data-src']||''),description,genres,chapters,source:BASE+path,updated:new Date().toISOString()};}
async function search(query,page){const qs=new URLSearchParams({title:query,page:String(page)}),html=await source('/manga?'+qs);return {version:4,items:extractTitles(html),page,hasMore:page<pageCount(html)};}
async function discover(){const results=await Promise.all(['solo leveling','omniscient','tower of god'].map(q=>search(q,1).catch(()=>({items:[]}))));const items=[...new Map(results.flatMap(r=>r.items).map(x=>[x.slug,x])).values()].filter(x=>x.slug!==DEFAULT);if(!items.length)throw new Error('Suggestions momentanément indisponibles');const order=['solo-leveling','omniscient-readers-viewpoint','tower-of-god','solo-leveling-ragnarok'];items.sort((a,b)=>{const rank=s=>order.includes(s)?order.indexOf(s):99;return rank(a.slug)-rank(b.slug);});return {version:4,items:items.slice(0,4),reason:'Pour explorer l’action et la fantasy'};}
export default {async fetch(request,env,ctx){const url=new URL(request.url),headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};const reply=(d,status=200)=>new Response(JSON.stringify(d),{status,headers});
 if(request.method!=='GET')return reply({erreur:'GET uniquement'},405);const origin=request.headers.get('Origin');if(origin&&origin!==ORIGIN)return reply({erreur:'Origine non autorisée'},403);
 const match=url.pathname.match(/^\/series\/([a-z0-9-]+)(?:\/chapter\/([^/]+))?$/),legacy=url.pathname.match(/^\/chapter\/([^/]+)$/),isSearch=url.pathname==='/search';
 if(!isSearch&&url.search)return reply({erreur:'Paramètres non acceptés'},400);if(match&&(!slugOK(match[1])||(match[2]&&!valid(match[2]))))return reply({erreur:'Adresse de manga ou chapitre invalide'},400);if(legacy&&!valid(legacy[1]))return reply({erreur:'Chapitre invalide'},400);
 if(!match&&!legacy&&!['/','/diagnostic','/chapters','/discover','/search'].includes(url.pathname))return reply({erreur:'Route inconnue'},404);
 const query=url.searchParams.get('q')?.trim()||'',page=Number(url.searchParams.get('page')||1);if(isSearch&&(query.length<2||query.length>80||!Number.isInteger(page)||page<1||page>30||[...url.searchParams.keys()].some(k=>!['q','page'].includes(k))))return reply({erreur:'Recherche de 2 à 80 caractères requise'},400);
 try{if(['/','/diagnostic'].includes(url.pathname)){const resultats=[];for(const t of tests)resultats.push(await inspect(t));return reply({diagnostic:'lelscanfr-v4',resultats});}
 const cache=globalThis.caches?.default,key=new Request(url.href),cached=cache?await cache.match(key):null;if(cached)return cached;
 let data;if(isSearch)data=await search(query,page);else if(url.pathname==='/discover')data=await discover();else if(url.pathname==='/chapters'||(match&&!match[2])){data=await catalog(match?.[1]||DEFAULT);if(url.pathname==='/chapters')data={...data,version:3,titre:data.title};}else{const slug=match?.[1]||DEFAULT,id=match?.[2]||legacy[1],pages=extractPages(await source('/manga/'+slug+'/'+id),id,slug);if(!pages.length||pages.length>150)throw new Error('Liste des images non reconnue');data={version:4,slug,chapitre:id,source:BASE+'/manga/'+slug+'/'+id,pages};if(legacy)data={...data,version:3};}
 const response=reply(data);response.headers.set('Cache-Control','public, max-age='+(isSearch?300:1800));if(cache&&ctx)ctx.waitUntil(cache.put(key,response.clone()));return response;
 }catch(e){return reply({erreur:'Lecture de la source impossible',detail:String(e.message)},502);}}
};
