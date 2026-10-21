CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athletes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  turma TEXT NOT NULL DEFAULT '',
  turma_order INTEGER NOT NULL DEFAULT 9,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  athlete_id INTEGER REFERENCES athletes(id),
  buyer_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'todas',
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando',
  mp_payment_id TEXT,
  presale INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_athlete ON orders(athlete_id);
