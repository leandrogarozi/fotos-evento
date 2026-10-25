// Impressão do rosto: 128 números (face-api). Guardamos em base64 de 128 bytes (valor x 200, limitado a -127..127).
// Só números ficam no banco; a selfie e as fotos nunca são comparadas no servidor, só esses vetores.
const SCALE = 200;
export const DIM = 128;
export const MAX_FACES = 16;

export const validVec = (a) => Array.isArray(a) && a.length === DIM && a.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 5);

export function packVec(a) {
  const u = new Int8Array(DIM);
  for (let i = 0; i < DIM; i++) u[i] = Math.max(-127, Math.min(127, Math.round(a[i] * SCALE)));
  let s = ''; for (let i = 0; i < DIM; i++) s += String.fromCharCode(u[i] & 255);
  return btoa(s);
}
export function unpackVec(b64) {
  const s = atob(b64), u = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) { const c = s.charCodeAt(i); u[i] = (c > 127 ? c - 256 : c) / SCALE; }
  return u;
}
export function dist(a, b) { let s = 0; for (let i = 0; i < DIM; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

// Compara o rosto `q` com uma fatia dos rostos do evento. Leve de propósito: a conta é interrompida assim que
// a distância já passou do limite (a maioria dos rostos descarta em poucas dezenas de números).
const SLACK_MAX = 0.12;
export function scanRows(rows, q, max) {
  const qq = new Int8Array(DIM); for (let i = 0; i < DIM; i++) qq[i] = Math.max(-127, Math.min(127, Math.round(q[i] * SCALE)));
  const lim2 = ((max + SLACK_MAX) * SCALE) ** 2, sure = new Map(), maybe = new Map();
  for (const r of rows) {
    const s = atob(r.vec); let sum = 0, i = 0;
    for (; i < DIM; i++) {
      const c = s.charCodeAt(i), d = (c > 127 ? c - 256 : c) - qq[i]; sum += d * d;
      if ((i & 15) === 15 && sum > lim2) break;
    }
    if (i < DIM || sum > lim2) continue;
    const d = Math.sqrt(sum) / SCALE;
    if (d <= max) { if (d < (sure.get(r.id) ?? 9)) sure.set(r.id, d); continue; }
    const slack = r.w > 0 && r.w < 60 ? SLACK_MAX : 0.05;
    if (d <= max + slack && d < (maybe.get(r.id) ?? 9)) maybe.set(r.id, d);
  }
  return { sure, maybe };
}

// Uma fatia (off, lim) dos rostos das fotos prontas do evento; `total` só na primeira fatia.
export async function searchSlice(env, eventId, q, max, off = 0, lim = 2000) {
  const { results } = await env.DB.prepare(
    `SELECT pf.photo_id AS id, pf.vec, pf.w FROM photo_faces pf JOIN photos p ON p.id = pf.photo_id
     WHERE p.event_id = ? AND p.has_orig = 1 AND p.has_prev = 1 ORDER BY pf.rowid LIMIT ? OFFSET ?`
  ).bind(eventId, lim, off).all();
  let total;
  if (off === 0) total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_faces pf JOIN photos p ON p.id = pf.photo_id WHERE p.event_id = ? AND p.has_orig = 1 AND p.has_prev = 1').bind(eventId).first()).n;
  const { sure, maybe } = scanRows(results, q, max);
  return { sure: [...sure], maybe: [...maybe], total, scanned: results.length };
}

// Busca completa (usada nos testes): junta todas as fatias.
export async function searchFaces(env, eventId, q, max, limit = 300, maybeLimit = 120) {
  const sure = new Map(), maybe = new Map(); let off = 0, total = 0;
  do {
    const r = await searchSlice(env, eventId, q, max, off, 2000); if (off === 0) total = r.total;
    for (const [id, d] of r.sure) if (d < (sure.get(id) ?? 9)) sure.set(id, d);
    for (const [id, d] of r.maybe) if (d < (maybe.get(id) ?? 9)) maybe.set(id, d);
    off += 2000;
  } while (off < total);
  const top = (m, n) => [...m].sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
  const ids = top(sure, limit);
  return { ids, maybe: top(maybe, maybeLimit + ids.length).filter((id) => !sure.has(id)).slice(0, maybeLimit), scanned: total };
}
