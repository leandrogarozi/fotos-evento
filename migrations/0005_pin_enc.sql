-- Senha criptografada só até o e-mail de confirmação sair (depois é apagada).
ALTER TABLE orders ADD COLUMN pin_enc TEXT NOT NULL DEFAULT '';
