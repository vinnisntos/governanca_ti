import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressão para a Vulnerabilidade/Instabilidade #1 do relatório de auditoria
// (V2 em RELATORIO_SEGURANCA_E_TESTES.txt): `.update(...).eq("id", ...)` sem
// `.select()` fazia o @supabase/supabase-js usar `Prefer: return=minimal`. Se
// a policy de RLS filtrasse a linha (usuário sem permissão sobre aquele
// registro), o Postgres/PostgREST afetava 0 linhas e devolvia
// `{ data: null, error: null }` — NÃO um erro — e o código tratava isso como
// sucesso. A correção encadeia `.select("id")` e trata array vazio como
// "sem permissão/não encontrado". Este arquivo garante que essa correção não
// regrida: cobre tanto o caso bloqueado pelo RLS (deve reportar erro) quanto
// o caso normal (deve continuar reportando sucesso).

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

function mockSupabaseUpdate(selectResult: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(selectResult);
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({ from }),
  }));
  return { select, eq, update, from };
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

describe("decideAccessRequestAction — UPDATE bloqueado pelo RLS não é reportado como sucesso", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("gestor sem permissão sobre a solicitação: 0 linhas afetadas gera erro, não sucesso", async () => {
    mockTrustedOrigin();
    const { from } = mockSupabaseUpdate({ data: [], error: null });
    const { redirectWithSuccess, redirectWithError } = mockActionRedirect();

    const { decideAccessRequestAction } = await import(
      "@/app/dashboard/approvals/actions"
    );

    const formData = new FormData();
    formData.set("request_id", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("decision", "aprovado");

    await runIgnoringRedirect(() => decideAccessRequestAction(formData));

    expect(from).toHaveBeenCalledWith("access_requests");
    expect(redirectWithError).toHaveBeenCalled();
    expect(redirectWithSuccess).not.toHaveBeenCalled();
  });

  it("aprovador com permissão: 1 linha afetada continua gerando sucesso", async () => {
    mockTrustedOrigin();
    mockSupabaseUpdate({ data: [{ id: "123e4567-e89b-12d3-a456-426614174000" }], error: null });
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

describe("cancelAccessRequestAction — UPDATE bloqueado pelo RLS não é reportado como sucesso", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("cancelamento de solicitação de outro usuário: 0 linhas afetadas gera erro, não sucesso", async () => {
    mockTrustedOrigin();
    mockSupabaseUpdate({ data: [], error: null });
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
    mockSupabaseUpdate({ data: [{ id: "123e4567-e89b-12d3-a456-426614174000" }], error: null });
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
