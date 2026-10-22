import { json, bad, readJson, uid } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { adminEvent } from '../../_lib/events.js';

// Passo 1 do upload: { filename, athleteIds } -> { id }. Os arquivos sobem depois (PUT orig / prev).
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  const ids = [...new Set((b.athleteIds || []).map(Number).filter(Boolean))];
  if (!ids.length && !b.geral) return bad('Escolha pelo menos um atleta (ou marque foto geral).');
  const ev = await adminEvent(request, env);
  if (ids.length) {
    const ok = await env.DB.prepare('SELECT COUNT(*) AS n FROM athletes WHERE event_id = ? AND id IN (SELECT value FROM json_each(?))').bind(ev.id, JSON.stringify(ids)).first();
    if (ok.n !== ids.length) return bad('Atleta não pertence a este evento.');
  }
  const id = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO photos (id, filename, created_at, triaged, event_id) VALUES (?, ?, ?, ?, ?)')
      .bind(id, String(b.filename || '').slice(0, 200), new Date().toISOString(), b.triaged ? 1 : 0, ev.id),
    ...ids.map((a) => env.DB.prepare('INSERT INTO photo_athletes (photo_id, athlete_id) VALUES (?, ?)').bind(id, a)),
  ]);
  return json({ id });
}
