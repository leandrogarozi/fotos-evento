import { json, bad, readJson, uid } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';

// Passo 1 do upload: { filename, athleteIds } -> { id }. Os arquivos sobem depois (PUT orig / prev).
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  const ids = [...new Set((b.athleteIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return bad('Escolha pelo menos um atleta.');
  const id = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO photos (id, filename, created_at) VALUES (?, ?, ?)')
      .bind(id, String(b.filename || '').slice(0, 200), new Date().toISOString()),
    ...ids.map((a) => env.DB.prepare('INSERT INTO photo_athletes (photo_id, athlete_id) VALUES (?, ?)').bind(id, a)),
  ]);
  return json({ id });
}
