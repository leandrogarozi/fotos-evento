import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { adminEvent } from '../../_lib/events.js';

const ORDER = { RX: 1, INT: 2, SC: 3 };

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const ev = await adminEvent(request, env);
  const { results } = await env.DB.prepare('SELECT id, name, turma, turma_order, active FROM athletes WHERE event_id = ?').bind(ev.id).all();
  return json({
    athletes: results
      .sort((a, b) => a.turma_order - b.turma_order || a.name.localeCompare(b.name, 'pt-BR'))
      .map(({ id, name, turma, active }) => ({ id, name, turma, active })),
  });
}

// { action: 'add', name, turma } | { action: 'toggle', id, active }
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  const ev = await adminEvent(request, env);
  if (b.action === 'bulk') { // vários de uma vez: uma linha por atleta, "Nome" ou "Nome, turma"
    const lines = String(b.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 300);
    if (!lines.length) return bad('Cole pelo menos um nome.');
    await env.DB.batch(lines.map((l) => {
      const [name, turma = ''] = l.split(/[,;\t]/).map((x) => x.trim());
      const t = turma.toUpperCase();
      return env.DB.prepare('INSERT INTO athletes (name, turma, turma_order, active, event_id) VALUES (?, ?, ?, 1, ?)').bind(name.slice(0, 120), t.slice(0, 20), ORDER[t] || 9, ev.id);
    }));
    return json({ ok: true, count: lines.length });
  }
  if (b.action === 'add') {
    const name = String(b.name || '').trim();
    const turma = String(b.turma || '').trim().toUpperCase();
    if (!name) return bad('Informe o nome.');
    await env.DB.prepare('INSERT INTO athletes (name, turma, turma_order, active, event_id) VALUES (?, ?, ?, 1, ?)')
      .bind(name, turma, ORDER[turma] || 9, ev.id).run();
    return json({ ok: true });
  }
  if (b.action === 'toggle') {
    await env.DB.prepare('UPDATE athletes SET active = ? WHERE id = ? AND event_id = ?').bind(b.active ? 1 : 0, Number(b.id), ev.id).run();
    return json({ ok: true });
  }
  return bad('Ação inválida.');
}
