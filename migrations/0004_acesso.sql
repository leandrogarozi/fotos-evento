-- Acesso do comprador por WhatsApp + senha numérica (guardada só como hash).
ALTER TABLE orders ADD COLUMN pin_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN pin_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS access_attempts (
  wpp TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
