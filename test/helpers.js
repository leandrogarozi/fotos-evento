import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function makeDB() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_atletas.sql', '0003_fotos.sql']) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const prep = (sql) => {
    const mk = (args) => ({
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { db.prepare(sql).run(...args); return {}; },
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
    delete: async (k) => { store.delete(k); },
  };
}
