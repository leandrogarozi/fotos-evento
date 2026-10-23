import { json, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';

// Quanto do armazenamento (R2) está em uso. Plano grátis da Cloudflare: 10 GB; acima disso cobra por GB.
export const LIMIT_BYTES = 10e9; // 10 GB (contagem decimal, a mais prudente)

async function sizes(bucket, prefix) {
  const out = []; let cursor;
  for (let i = 0; i < 200; i++) { // até 200 mil arquivos
    const r = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of r.objects) out.push([o.key.slice(prefix.length), o.size]);
    if (!r.truncated) break; cursor = r.cursor;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const [orig, prev] = await Promise.all([sizes(env.FOTOS, 'orig/'), sizes(env.FOTOS, 'prev/')]);
  const rows = (await env.DB.prepare('SELECT p.id, p.event_id AS eid FROM photos p').all()).results;
  const owner = new Map(rows.map((r) => [r.id, r.eid]));
  const evs = (await env.DB.prepare('SELECT id, name FROM events ORDER BY id').all()).results;
  const per = new Map(evs.map((e) => [e.id, { id: e.id, name: e.name, photos: 0, bytes: 0 }]));
  const orphan = { files: 0, bytes: 0 };
  const sum = (list) => list.reduce((s, x) => s + x[1], 0);
  const seen = new Set();
  for (const [id, size] of [...orig, ...prev]) {
    const e = per.get(owner.get(id));
    if (!e) { orphan.files++; orphan.bytes += size; continue; }
    e.bytes += size; if (!seen.has(id)) { seen.add(id); e.photos++; }
  }
  const used = sum(orig) + sum(prev), photos = new Set(orig.map((x) => x[0])).size;
  return json({
    limit: LIMIT_BYTES, used, pct: Math.round((used / LIMIT_BYTES) * 1000) / 10,
    originals: { files: orig.length, bytes: sum(orig) }, previews: { files: prev.length, bytes: sum(prev) },
    photos, avgPerPhoto: photos ? Math.round(used / photos) : 0,
    byEvent: [...per.values()].filter((e) => e.photos || e.bytes), orphan,
  }, 200, { 'cache-control': 'no-store' });
}

// { action: 'limpar' }: apaga arquivos que não pertencem a nenhuma foto do banco (sobras de envios que falharam).
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  if (b.action !== 'limpar') return json({ error: 'Ação inválida.' }, 400);
  const ids = new Set((await env.DB.prepare('SELECT id FROM photos').all()).results.map((r) => r.id));
  let files = 0, bytes = 0;
  for (const prefix of ['orig/', 'prev/']) {
    const stray = (await sizes(env.FOTOS, prefix)).filter(([id]) => !ids.has(id));
    for (let i = 0; i < stray.length; i += 500) await env.FOTOS.delete(stray.slice(i, i + 500).map(([id]) => prefix + id));
    files += stray.length; bytes += stray.reduce((s, x) => s + x[1], 0);
  }
  return json({ ok: true, files, bytes });
}
