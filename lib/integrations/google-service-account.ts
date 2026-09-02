import "server-only";
import { createSign } from "node:crypto";

// Autenticação server-to-server no Google (Service Account, fluxo JWT
// bearer — RFC 7523), sem depender do SDK `googleapis` (pesado; só
// precisamos de um GET autenticado na Sheets API). GOOGLE_SERVICE_ACCOUNT_KEY
// guarda o JSON da chave baixada no Google Cloud Console, em base64 (evita
// problemas de escaping das quebras de linha da private_key dentro de um
// .env) — também aceita o JSON cru, por conveniência em dev.

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedToken = { accessToken: string; expiresAt: number };

let cachedToken: CachedToken | null = null;

function loadServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não configurada");
  }

  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(json) as ServiceAccountKey;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY inválida: não é um JSON válido (nem em base64)");
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY inválida: faltam client_email/private_key");
  }

  return parsed;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function requestAccessToken(): Promise<CachedToken> {
  const key = loadServiceAccountKey();
  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const issuedAt = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: tokenUri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })
  );
  const signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Falha ao obter access token do Google (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function getGoogleAccessToken(): Promise<string> {
  // Margem de 60s antes do vencimento real, pra nunca devolver um token
  // "quase vencido" que expire em pleno voo de uma chamada.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await requestAccessToken();
  return cachedToken.accessToken;
}
