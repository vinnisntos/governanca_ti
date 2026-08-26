// Sem "server-only" e sem nenhum import Node-only: middleware.ts roda no
// runtime Edge e precisa do nome do cookie sem puxar lib/auth/cookies.ts
// (que usa next/headers, API de Server Component/Action, não de Middleware).
export const SESSION_COOKIE_NAME = "session_token";
