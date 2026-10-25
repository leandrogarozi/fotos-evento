import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Relógio fixo (22/10/2026): os testes não dependem do dia em que rodam (pré-venda padrão termina em 24/10).
const FIXED = Date.parse('2026-10-22T15:00:00Z');
Date.now = () => FIXED + Math.round(performance.now());

export const ALL_MIGRATIONS = ['0001_init.sql', '0002_atletas.sql', '0003_fotos.sql', '0004_acesso.sql', '0005_pin_enc.sql', '0006_triagem.sql', '0007_eventos.sql', '0008_pacote_limite.sql', '0009_rostos.sql', '0010_rosto_tamanho.sql', '0011_favoritas.sql'];
export function makeDB(files = ALL_MIGRATIONS) {
  const db = new DatabaseSync(':memory:');
  for (const f of files) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const prep = (sql) => {
    const mk = (args) => ({
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    });
    const s = { bind: (...args) => ({ ...mk(args), _sql: sql, _args: args }), ...mk([]) };
    return s;
  };
  return { prepare: prep, batch: async (stmts) => { for (const s of stmts) await s.run(); } };
}

// R2 de mentira
export function makeR2() {
  const store = new Map();
  return {
    store,
    put: async (k, body, opts) => { store.set(k, { buf: new Uint8Array(await new Response(body).arrayBuffer()), opts }); },
    get: async (k) => (store.has(k) ? { body: new Response(store.get(k).buf).body, httpMetadata: store.get(k).opts && store.get(k).opts.httpMetadata } : null),
    list: async ({ prefix = '', cursor, limit = 1000 } = {}) => {
      const all = [...store].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.buf.length }));
      const start = Number(cursor) || 0, page = all.slice(start, start + limit);
      return { objects: page, truncated: start + limit < all.length, cursor: String(start + limit) };
    },
    delete: async (k) => { for (const key of [].concat(k)) store.delete(key); },
  };
}
