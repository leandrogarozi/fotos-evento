import { hmacHex, onlyDigits, token } from './util.js';

// WhatsApp comparável: só dígitos, sem o 55 do país.
export function normWpp(s) {
  let d = onlyDigits(s);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}
export const validPin = (p) => /^\d{4,6}$/.test(String(p || '').trim());
export async function newPin(pin, wpp) {
  const salt = token();
  return { salt, hash: await hmacHex(salt, `${wpp}:${String(pin).trim()}`) };
}
export const checkPin = async (pin, wpp, salt, hash) => !!hash && (await hmacHex(salt, `${wpp}:${String(pin).trim()}`)) === hash;
