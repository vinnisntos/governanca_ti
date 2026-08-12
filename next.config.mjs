// Arquitetura alinhada com as diretrizes do ADR Master.
// Headers de segurança de defesa em profundidade também no nível da aplicação
// (a camada primária é o Nginx em produção — ver ARQUITETURA_TECNICA.md, seção 6.2).
// CSP e HSTS eram emitidos só pelo Nginx; duplicados aqui (mesmos valores já
// documentados na seção 6.2) para que a aplicação não dependa de uma única
// camada — protege também ambientes onde o Next.js seja acessado sem o
// Nginx na frente (ex.: dev/staging, ou antes do deploy em produção).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
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
