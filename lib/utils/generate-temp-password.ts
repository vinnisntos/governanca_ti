import "server-only";
import crypto from "crypto";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Gera a senha descartável do primeiro acesso: crypto.randomInt (não
// Math.random) por ser criptograficamente seguro, e evita caracteres
// ambíguos (0/O, 1/l/I) já que o admin_ti costuma repassar isso por telefone
// ou chat. Garante ao menos 1 maiúscula, 1 minúscula, 1 dígito e 1 símbolo
// para passar em qualquer política mínima de senha do Supabase Auth.
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset: string) {
  return charset[crypto.randomInt(charset.length)];
}

export function generateTempPassword(): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: 8 }, () => pick(ALL));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
