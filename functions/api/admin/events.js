import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { eventById, slugify } from '../../_lib/events.js';

// Datas e prazos não são copiados ao criar um evento a partir de outro.
const NOT_COPIED = ['presale_end', 'published_at', 'sales_end', 'sales_days', 'event_date', 'event_name'];

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.slug, e.name, e.is_main, e.archived, e.created_at,
            (SELECT COUNT(*) FROM athletes a WHERE a.event_id = e.id) AS athletes,
            (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.has_orig = 1 AND p.has_prev = 1) AS photos,
            (SELECT COUNT(*) FROM orders o WHERE o.event_id = e.id AND o.status IN ('pago', 'liberado')) AS paid
     FROM events e ORDER BY e.is_main DESC, e.id`
  ).all();
  return json({ events: results.map((e) => ({ ...e, is_main: !!e.is_main, archived: !!e.archived })) });
}

// { action: 'create', name, slug?, copyFrom? } | { action: 'update', id, name?, slug? } | { action: 'archive', id, archived } | { action: 'main', id }
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  if (b.action === 'create') {
    const name = String(b.name || '').trim().slice(0, 120);
    if (name.length < 2) return bad('Dê um nome ao evento.');
    let slug = slugify(b.slug || name), n = 1;
    while (await env.DB.prepare('SELECT 1 FROM events WHERE slug = ?').bind(slug).first()) slug = `${slugify(b.slug || name)}-${++n}`;
    const r = await env.DB.prepare('INSERT INTO events (slug, name, is_main, archived, created_at) VALUES (?, ?, 0, 0, ?)').bind(slug, name, new Date().toISOString()).run();
    const id = (await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(slug).first()).id;
    const stmts = [env.DB.prepare("INSERT INTO event_config (event_id, key, value) VALUES (?, 'event_name', ?)").bind(id, name)];
    if (b.copyFrom && (await eventById(env, b.copyFrom))) {
      const keys = NOT_COPIED.map(() => '?').join(',');
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO event_config (event_id, key, value) SELECT ?, key, value FROM event_config WHERE event_id = ? AND key NOT IN (${keys})`).bind(id, Number(b.copyFrom), ...NOT_COPIED));
    }
    await env.DB.batch(stmts);
    return json({ ok: true, id, slug });
  }
  const ev = await eventById(env, b.id);
  if (!ev) return bad('Evento não encontrado.', 404);
  if (b.action === 'update') {
    const stmts = [];
    if (b.name !== undefined) {
      const name = String(b.name).trim().slice(0, 120); if (name.length < 2) return bad('Nome inválido.');
      stmts.push(env.DB.prepare('UPDATE events SET name = ? WHERE id = ?').bind(name, ev.id));
      stmts.push(env.DB.prepare("INSERT INTO event_config (event_id, key, value) VALUES (?, 'event_name', ?) ON CONFLICT(event_id, key) DO UPDATE SET value = excluded.value").bind(ev.id, name));
    }
    if (b.slug !== undefined && !ev.is_main) {
      const slug = slugify(b.slug);
      const taken = await env.DB.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').bind(slug, ev.id).first();
      if (taken) return bad('Já existe um evento com esse endereço.');
      stmts.push(env.DB.prepare('UPDATE events SET slug = ? WHERE id = ?').bind(slug, ev.id));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }
  if (b.action === 'archive') {
    if (ev.is_main && b.archived) return bad('O evento principal não pode ser arquivado. Escolha outro como principal antes.');
    await env.DB.prepare('UPDATE events SET archived = ? WHERE id = ?').bind(b.archived ? 1 : 0, ev.id).run();
    return json({ ok: true });
  }
  if (b.action === 'main') { // o evento principal é o que abre no endereço sem ?e=
    await env.DB.batch([
      env.DB.prepare('UPDATE events SET is_main = 0'),
      env.DB.prepare('UPDATE events SET is_main = 1, archived = 0 WHERE id = ?').bind(ev.id),
    ]);
    return json({ ok: true });
  }
  return bad('Ação inválida.');
}
