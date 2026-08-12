// Arquitetura alinhada com as diretrizes do ADR Master.
// Headers de segurança de defesa em profundidade também no nível da aplicação
// (a camada primária é o Nginx em produção — ver ARQUITETURA_TECNICA.md, seção 6.2).
// HSTS era emitido só pelo Nginx; duplicado aqui (mesmo valor já documentado
// na seção 6.2) para que a aplicação não dependa de uma única camada —
// protege também ambientes onde o Next.js seja acessado sem o Nginx na
// frente (ex.: dev/staging, ou antes do deploy em produção).
//
// Content-Security-Policy NÃO fica aqui: script-src exige um nonce por
// requisição (o App Router injeta o payload de RSC via <script> inline —
// sem nonce, script-src 'self' bloqueia esses scripts e quebra a hidratação
// no cliente). Ela é gerada em middleware.ts.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
