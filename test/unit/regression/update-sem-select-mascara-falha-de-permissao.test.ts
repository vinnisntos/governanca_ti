import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressão para a Vulnerabilidade/Instabilidade #1 do relatório de auditoria
// (V2 em RELATORIO_SEGURANCA_E_TESTES.txt): no mundo Supabase, um UPDATE sem
// `.select()` fazia o @supabase/supabase-js usar `Prefer: return=minimal` — se
// a policy de RLS filtrasse a linha, o Postgres/PostgREST afetava 0 linhas e
// devolvia sucesso silencioso. Sem RLS, o mesmo risco existe de outra forma:
// um UPDATE com WHERE explícito que não bate (usuário sem permissão) também
// afeta 0 linhas — a correção continua sendo checar rowCount/RETURNING e
// tratar 0 como erro, nunca sucesso. Este arquivo garante que essa checagem
// não regrida, agora contra lib/db/context.withRequestContext.

function mockTrustedOrigin() {
  vi.doMock("next/headers", () => ({
    headers: async () => ({
      get: (key: string) =>
        (
          {
            origin: "https://portal.empresa.com",
            host: "portal.empresa.com",
          } as Record<string, string>
        )[key] ?? null,
    }),
  }));
}

function mockSession() {
  const session = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "gestor@empresa.com",
    full_name: "Gestor",
    role: "gestor" as const,
    is_active: true,
    must_change_password: false,
    department_id: null,
    manager_id: null,
  };
  vi.doMock("@/lib/auth/session", () => ({ getSession: async () => session }));
  vi.doMock("@/lib/utils/client-ip", () => ({ getClientIp: async () => null }));
  return session;
}

function mockWithRequestContext(rowCount: number) {
  const withRequestContext = vi.fn().mockResolvedValue({ rowCount });
  vi.doMock("@/lib/db/context", () => ({ withRequestContext }));
  return withRequestContext;
}

function mockActionRedirect() {
  // O redirectWithError/redirectWithSuccess reais chamam redirect() do
  // Next.js, que sempre lança (nunca retorna) — os mocks precisam fazer o
  // mesmo, senão a action continua executando e chamaria os dois em
  // sequência (o que nunca acontece em runtime real).
  const redirectWithSuccess = vi.fn(() => {
    throw new Error("REDIRECT_SUCCESS");
  });
  const redirectWithError = vi.fn(() => {
    throw new Error("REDIRECT_ERROR");
  });
  vi.doMock("@/lib/utils/action-redirect", () => ({
    redirectWithSuccess,
    redirectWithError,
  }));
  return { redirectWithSuccess, redirectWithError };
}

async function runIgnoringRedirect(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    // esperado: redirectWithError/redirectWithSuccess mockados lançam para
    // simular o comportamento real do redirect() do Next.js.
  }
}

describe("decideAccessRequestAction — UPDATE sem linha afetada não é reportado como sucesso", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("gestor sem permissão sobre a solicitação: 0 linhas afetadas gera erro, não sucesso", async () => {
    mockTrustedOrigin();
    mockSession();
    const withRequestContext = mockWithRequestContext(0);
    const { redirectWithSuccess, redirectWithError } = mockActionRedirect();

    const { decideAccessRequestAction } = await import(
      "@/app/dashboard/approvals/actions"
    );

    const formData = new FormData();
    formData.set("request_id", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("decision", "aprovado");

    await runIgnoringRedirect(() => decideAccessRequestAction(formData));

    expect(withRequestContext).toHaveBeenCalled();
    expect(redirectWithError).toHaveBeenCalled();
    expect(redirectWithSuccess).not.toHaveBeenCalled();
  });

  it("aprovador com permissão: 1 linha afetada continua gerando sucesso", async () => {
    mockTrustedOrigin();
    mockSession();
    mockWithRequestContext(1);
    const { redirectWithSuccess, redirectWithError } = mockActionRedirect();

    const { decideAccessRequestAction } = await import(
      "@/app/dashboard/approvals/actions"
    );

    const formData = new FormData();
    formData.set("request_id", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("decision", "aprovado");

    await runIgnoringRedirect(() => decideAccessRequestAction(formData));

    expect(redirectWithSuccess).toHaveBeenCalled();
    expect(redirectWithError).not.toHaveBeenCalled();
  });
});

describe("cancelAccessRequestAction — UPDATE sem linha afetada não é reportado como sucesso", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("cancelamento de solicitação de outro usuário: 0 linhas afetadas gera erro, não sucesso", async () => {
    mockTrustedOrigin();
    mockSession();
    mockWithRequestContext(0);
    const { redirectWithSuccess, redirectWithError } = mockActionRedirect();

    const { cancelAccessRequestAction } = await import(
      "@/app/dashboard/access-requests/actions"
    );

    const formData = new FormData();
    formData.set("request_id", "123e4567-e89b-12d3-a456-426614174000");

    await runIgnoringRedirect(() => cancelAccessRequestAction(formData));

    expect(redirectWithError).toHaveBeenCalled();
    expect(redirectWithSuccess).not.toHaveBeenCalled();
  });

  it("cancelamento da própria solicitação pendente: 1 linha afetada continua gerando sucesso", async () => {
    mockTrustedOrigin();
    mockSession();
    mockWithRequestContext(1);
    const { redirectWithSuccess, redirectWithError } = mockActionRedirect();

    const { cancelAccessRequestAction } = await import(
      "@/app/dashboard/access-requests/actions"
    );

    const formData = new FormData();
    formData.set("request_id", "123e4567-e89b-12d3-a456-426614174000");

    await runIgnoringRedirect(() => cancelAccessRequestAction(formData));

    expect(redirectWithSuccess).toHaveBeenCalled();
    expect(redirectWithError).not.toHaveBeenCalled();
  });
});
