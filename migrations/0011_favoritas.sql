-- Fotos favoritas salvas por quem escolhe (WhatsApp + senha): continuar depois, em outro aparelho.
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL DEFAULT 1,
  whatsapp TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  token TEXT NOT NULL,
  athlete_id INTEGER,
  photo_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, whatsapp)
);
CREATE INDEX IF NOT EXISTS idx_fav_token ON favorites(token);
