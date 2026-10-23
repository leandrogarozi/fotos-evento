-- Largura (em pixels) do rosto na foto: rostos pequenos têm tolerância maior na busca.
ALTER TABLE photo_faces ADD COLUMN w INTEGER NOT NULL DEFAULT 0;
