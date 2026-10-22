// Cria sozinho as tabelas/colunas que faltarem (idempotente), para o deploy não depender
// de você rodar migrações à mão. Os arquivos em migrations/ continuam sendo a referência.
const DDL = [
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, filename TEXT NOT NULL DEFAULT '', has_orig INTEGER NOT NULL DEFAULT 0, has_prev INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS photo_athletes (photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, athlete_id INTEGER NOT NULL REFERENCES athletes(id), PRIMARY KEY (photo_id, athlete_id))`,
  `CREATE INDEX IF NOT EXISTS idx_pa_athlete ON photo_athletes(athlete_id)`,
  `CREATE TABLE IF NOT EXISTS order_photos (order_id TEXT NOT NULL REFERENCES orders(id), photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, PRIMARY KEY (order_id, photo_id))`,
  `CREATE TABLE IF NOT EXISTS access_attempts (wpp TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, locked_until TEXT)`,
];
const ORDER_COLUMNS = [['pin_salt', "TEXT NOT NULL DEFAULT ''"], ['pin_hash', "TEXT NOT NULL DEFAULT ''"]];

let ready = null;
export function ensureSchema(env) {
  if (!env.DB) return Promise.resolve();
  if (!ready) ready = run(env).catch((e) => { ready = null; throw e; });
  return ready;
}
export const resetSchemaCache = () => { ready = null; };

async function run(env) {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  const { results } = await env.DB.prepare('PRAGMA table_info(orders)').all();
  const have = new Set(results.map((r) => r.name));
  for (const [name, def] of ORDER_COLUMNS) {
    if (have.has(name)) continue;
    try { await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${def}`).run(); } catch (_) { /* outra instância criou antes */ }
  }
}
