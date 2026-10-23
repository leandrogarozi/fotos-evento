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

// Fotos prontas do evento cujo rosto bate com `q`.
// ids: parecidas de verdade (distância <= max). maybe: "talvez sejam você" (um pouco acima; rostos pequenos, de longe, ganham mais folga).
export async function searchFaces(env, eventId, q, max, limit = 300, maybeLimit = 120) {
  const { results } = await env.DB.prepare(
    `SELECT pf.photo_id AS id, pf.vec, pf.w FROM photo_faces pf JOIN photos p ON p.id = pf.photo_id
     WHERE p.event_id = ? AND p.has_orig = 1 AND p.has_prev = 1`
  ).bind(eventId).all();
  const sure = new Map(), maybe = new Map();
  for (const r of results) {
    const d = dist(q, unpackVec(r.vec));
    if (d <= max) { if (d < (sure.get(r.id) ?? 9)) sure.set(r.id, d); continue; }
    const slack = r.w > 0 && r.w < 60 ? 0.12 : 0.05;
    if (d <= max + slack && d < (maybe.get(r.id) ?? 9)) maybe.set(r.id, d);
  }
  const top = (m, n) => [...m].sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
  const ids = top(sure, limit);
  return { ids, maybe: top(maybe, maybeLimit + ids.length).filter((id) => !sure.has(id)).slice(0, maybeLimit), scanned: results.length };
}
