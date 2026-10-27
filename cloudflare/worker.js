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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers });
    if (request.method !== 'GET') return reply({ erreur: 'GET uniquement' }, 405);
    if (url.pathname !== '/' && url.pathname !== '/diagnostic') return reply({ erreur: 'Route inconnue' }, 404);
    if (url.search) return reply({ erreur: 'Aucun parametre accepte' }, 400);
    const origin = request.headers.get('Origin');
    if (origin && origin !== ORIGIN) return reply({ erreur: 'Origine non autorisee' }, 403);
    const results = [];
    for (const test of tests) results.push(await inspect(test));
    return reply({ diagnostic: 'lelscanfr-v1', date: new Date().toISOString(), note: 'Controle technique uniquement. Lecture complete et hors connexion non valides.', resultats: results });
  },
};
