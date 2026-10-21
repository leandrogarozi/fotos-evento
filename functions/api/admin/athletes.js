import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';

const ORDER = { RX: 1, INT: 2, SC: 3 };

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { results } = await env.DB.prepare('SELECT id, name, turma, active FROM athletes ORDER BY turma_order, name COLLATE NOCASE').all();
  return json({ athletes: results });
}

// { action: 'add', name, turma } | { action: 'toggle', id, active }
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  if (b.action === 'add') {
    const name = String(b.name || '').trim();
    const turma = String(b.turma || '').trim().toUpperCase();
    if (!name) return bad('Informe o nome.');
    await env.DB.prepare('INSERT INTO athletes (name, turma, turma_order, active) VALUES (?, ?, ?, 1)')
      .bind(name, turma, ORDER[turma] || 9).run();
    return json({ ok: true });
  }
  if (b.action === 'toggle') {
    await env.DB.prepare('UPDATE athletes SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, Number(b.id)).run();
    return json({ ok: true });
  }
  return bad('Ação inválida.');
}
