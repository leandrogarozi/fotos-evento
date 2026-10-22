-- Foto já olhada na triagem e deixada como 'geral' (torcida, ambiente): não volta para a fila.
ALTER TABLE photos ADD COLUMN triaged INTEGER NOT NULL DEFAULT 0;
