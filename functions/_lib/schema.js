// Cria sozinho as tabelas/colunas que faltarem (idempotente), para o deploy não depender
// de você rodar migrações à mão. Os arquivos em migrations/ continuam sendo a referência.
const DDL = [
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, filename TEXT NOT NULL DEFAULT '', has_orig INTEGER NOT NULL DEFAULT 0, has_prev INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS photo_athletes (photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, athlete_id INTEGER NOT NULL REFERENCES athletes(id), PRIMARY KEY (photo_id, athlete_id))`,
  `CREATE INDEX IF NOT EXISTS idx_pa_athlete ON photo_athletes(athlete_id)`,
  `CREATE TABLE IF NOT EXISTS photo_faces (photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, n INTEGER NOT NULL, vec TEXT NOT NULL, PRIMARY KEY (photo_id, n))`,
  `CREATE TABLE IF NOT EXISTS order_photos (order_id TEXT NOT NULL REFERENCES orders(id), photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, PRIMARY KEY (order_id, photo_id))`,
  `CREATE TABLE IF NOT EXISTS access_attempts (wpp TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, locked_until TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, is_main INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS event_config (event_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (event_id, key))`,
];
// Depois das colunas: o evento atual vira o evento principal (id 1) com a configuração que já existe.
const SEED = [
  `INSERT OR IGNORE INTO events (id, slug, name, is_main, created_at) VALUES (1, 'principal', COALESCE((SELECT value FROM config WHERE key = 'event_name'), 'Evento'), 1, datetime('now'))`,
  `INSERT OR IGNORE INTO event_config (event_id, key, value) SELECT 1, key, value FROM config WHERE NOT EXISTS (SELECT 1 FROM event_config WHERE event_id = 1)`,
  `CREATE INDEX IF NOT EXISTS idx_athletes_event ON athletes(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id)`,
];
const ADD_COLUMNS = [
  ['orders', 'pin_salt', "TEXT NOT NULL DEFAULT ''"], ['orders', 'pin_hash', "TEXT NOT NULL DEFAULT ''"], ['orders', 'pin_enc', "TEXT NOT NULL DEFAULT ''"],
  ['photos', 'triaged', 'INTEGER NOT NULL DEFAULT 0'],
  ['athletes', 'event_id', 'INTEGER NOT NULL DEFAULT 1'], ['photos', 'event_id', 'INTEGER NOT NULL DEFAULT 1'], ['orders', 'event_id', 'INTEGER NOT NULL DEFAULT 1'], ['orders', 'pack_limit', 'INTEGER NOT NULL DEFAULT 0'], ['photos', 'faces_done', 'INTEGER NOT NULL DEFAULT 0'],
];

let ready = null;
export function ensureSchema(env) {
  if (!env.DB) return Promise.resolve();
  if (!ready) ready = run(env).catch((e) => { ready = null; throw e; });
  return ready;
}
export const resetSchemaCache = () => { ready = null; };

async function run(env) {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  for (const table of [...new Set(ADD_COLUMNS.map((c) => c[0]))]) {
    const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    const have = new Set(results.map((r) => r.name));
    for (const [, name, def] of ADD_COLUMNS.filter((c) => c[0] === table)) {
      if (have.has(name)) continue;
      try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`).run(); } catch (_) { /* outra instância criou antes */ }
    }
  }
  await env.DB.batch(SEED.map((q) => env.DB.prepare(q)));
}
