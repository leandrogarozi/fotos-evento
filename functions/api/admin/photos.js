import { json } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.name, a.turma, a.turma_order, COUNT(p.id) AS n
     FROM athletes a
     LEFT JOIN photo_athletes pa ON pa.athlete_id = a.id
     LEFT JOIN photos p ON p.id = pa.photo_id AND p.has_orig = 1 AND p.has_prev = 1
     GROUP BY a.id`
  ).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE has_orig = 1 AND has_prev = 1').first();
  return json({
    total: total.n,
    athletes: results.sort((a, b) => a.turma_order - b.turma_order || a.name.localeCompare(b.name, 'pt-BR'))
      .map(({ id, name, turma, n }) => ({ id, name, turma, n })),
  });
}
