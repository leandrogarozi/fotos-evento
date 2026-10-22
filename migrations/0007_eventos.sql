-- Vários eventos: cada evento tem sua configuração, atletas, fotos e pedidos.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_main INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_config (
  event_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (event_id, key)
);
ALTER TABLE athletes ADD COLUMN event_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE photos ADD COLUMN event_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN event_id INTEGER NOT NULL DEFAULT 1;
-- O evento que já existe vira o evento principal (id 1), levando a configuração atual.
INSERT OR IGNORE INTO events (id, slug, name, is_main, created_at)
  VALUES (1, 'principal', COALESCE((SELECT value FROM config WHERE key = 'event_name'), 'Evento'), 1, datetime('now'));
INSERT OR IGNORE INTO event_config (event_id, key, value)
  SELECT 1, key, value FROM config WHERE NOT EXISTS (SELECT 1 FROM event_config WHERE event_id = 1);
CREATE INDEX IF NOT EXISTS idx_athletes_event ON athletes(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
