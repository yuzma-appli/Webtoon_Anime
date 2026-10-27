// Diagnostic limite a trois adresses fixes : ce fichier ne cree pas de proxy ouvert.
const ORIGIN = 'https://yuzma-appli.github.io';
const BASE = 'https://www.lelscanfr.com';
const tests = [
  ['fiche', BASE + '/manga/the-beginning-after-the-end/'],
  ['chapitre', BASE + '/manga/the-beginning-after-the-end/192'],
  ['image', BASE + '/storage/content/the-beginning-after-the-end/192/67b1f2a40eb74.webp'],
];

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

export function extractPages(html) {
  const pages = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const a of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[a[1].toLowerCase()] = a[3].replace(/&amp;/g, '&');
    for (const key of ['data-src', 'data-lazy-src', 'src']) {
      if (!attrs[key]) continue;
      try {
        const u = new URL(attrs[key], BASE);
        if (u.origin !== BASE || !u.pathname.startsWith('/storage/content/the-beginning-after-the-end/192/') || !/\.(webp|png|jpe?g)$/i.test(u.pathname) || u.search || u.hash) continue;
        if (!pages.includes(u.href)) pages.push(u.href);
        break;
      } catch {}
    }
  }
  return pages;
}

async function getChapter(reply) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(tests[1][1], { redirect: 'manual', signal: controller.signal });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('text/html')) {
      await r.body?.cancel();
      return reply({ erreur: 'Source inaccessible', statutSource: r.status }, 502);
    }
    const reader = r.body.getReader(); const chunks = []; let total = 0;
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        total += value.length;
        if (total > 1024 * 1024) throw new Error('Page trop volumineuse');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    const pages = extractPages(new TextDecoder().decode(bytes));
    if (!pages.length || pages.length > 150) return reply({ erreur: 'Liste des images non reconnue' }, 502);
    return reply({ version: 2, chapitre: 192, titre: 'The Beginning After the End', source: tests[1][1], pages });
  } catch (e) { return reply({ erreur: 'Lecture de la source impossible', detail: String(e.message) }, 502); }
  finally { clearTimeout(timer); }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers });
    if (request.method !== 'GET') return reply({ erreur: 'GET uniquement' }, 405);
    if (!['/', '/diagnostic', '/chapter/192'].includes(url.pathname)) return reply({ erreur: 'Route inconnue' }, 404);
    if (url.search) return reply({ erreur: 'Aucun parametre accepte' }, 400);
    const origin = request.headers.get('Origin');
    if (origin && origin !== ORIGIN) return reply({ erreur: 'Origine non autorisee' }, 403);
    if (url.pathname === '/chapter/192') return getChapter(reply);
    const results = [];
    for (const test of tests) results.push(await inspect(test));
    return reply({ diagnostic: 'lelscanfr-v1', date: new Date().toISOString(), note: 'Controle technique uniquement. Lecture complete et hors connexion non valides.', resultats: results });
  },
};
