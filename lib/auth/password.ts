import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Sem "server-only": scripts/seed-admin.ts (rodado fora do Next, via tsx)
// também importa este módulo diretamente. Não expõe nenhuma API específica
// do Next (cookies/headers/pool) — só crypto puro — então não há risco real
// de vazar pra um bundle de client; a barreira real é que nenhum Server
// Action expõe hash/verify pro client, só usa o resultado.

// util.promisify(scrypt) perde a sobrecarga com o parâmetro `options`
// (N/r/p) na tipagem — escrevemos o wrapper à mão em vez de brigar com isso.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

// scrypt nativo do Node — sem dependência externa (bcrypt/argon2). Formato
// armazenado em profiles.password_hash: "scrypt:N:r:p:<salt-hex>:<hash-hex>",
// auto-descritivo para permitir subir os custos no futuro sem invalidar
// hashes antigos.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(plain, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltHex!, "hex");
  const expected = Buffer.from(hashHex!, "hex");

  const derivedKey = await scryptAsync(plain, salt, expected.length, { N, r, p });

  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
}
