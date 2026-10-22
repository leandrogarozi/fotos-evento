// AES-GCM para guardar a senha só até o e-mail sair. Chave: PIN_SECRET (ou ADMIN_PASSWORD).
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode('pin.' + (env.PIN_SECRET || env.ADMIN_PASSWORD || '')));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptPin(env, pin) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(String(pin))));
  return b64(iv) + '.' + b64(ct);
}
export async function decryptPin(env, s) {
  try {
    const [iv, ct] = String(s).split('.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(ct)));
  } catch { return null; }
}
