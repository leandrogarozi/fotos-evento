CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL DEFAULT '',
  has_orig INTEGER NOT NULL DEFAULT 0,
  has_prev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_athletes (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  PRIMARY KEY (photo_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_pa_athlete ON photo_athletes(athlete_id);

CREATE TABLE IF NOT EXISTS order_photos (
  order_id TEXT NOT NULL REFERENCES orders(id),
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, photo_id)
);
