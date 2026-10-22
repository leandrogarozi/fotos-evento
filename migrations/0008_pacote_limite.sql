-- Pacote com limite de fotos: guarda no pedido o limite valendo na hora da compra (0 = sem limite).
ALTER TABLE orders ADD COLUMN pack_limit INTEGER NOT NULL DEFAULT 0;
