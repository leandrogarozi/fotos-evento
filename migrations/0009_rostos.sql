-- Busca por rosto: guarda só números (impressão do rosto, 128 valores em base64), nunca imagens de pessoas.
CREATE TABLE IF NOT EXISTS photo_faces (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  vec TEXT NOT NULL,
  PRIMARY KEY (photo_id, n)
);
ALTER TABLE photos ADD COLUMN faces_done INTEGER NOT NULL DEFAULT 0;
