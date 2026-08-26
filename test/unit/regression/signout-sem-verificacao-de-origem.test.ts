import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressão para a Vulnerabilidade #2 do relatório de auditoria (V5 em
// RELATORIO_SEGURANCA_E_TESTES.txt): signOutAction era a única Server Action
// de mutação do projeto sem assertTrustedOrigin(), permitindo logout forçado
// via CSRF. A correção adiciona a mesma checagem usada por todas as outras
// actions. Este arquivo garante que a correção não regrida: origem não
// confiável nunca deve derrubar a sessão, e origem confiável continua
// funcionando normalmente.

function mockHeaders(entries: Record<string, string | undefined>) {
  vi.doMock("next/headers", () => ({
    headers: async () => ({
      get: (key: string) => entries[key] ?? null,
    }),
  }));
}

function mockDestroySession() {
  const destroySession = vi.fn().mockResolvedValue(undefined);
  vi.doMock("@/lib/auth/session", () => ({ destroySession }));
  return destroySession;
}

function mockRedirect() {
  return vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  });
}

describe("signOutAction — não age quando a requisição vem de uma origem não confiável", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("não chama destroySession() quando Origin é de um site diferente do Host", async () => {
    mockHeaders({ origin: "https://atacante.com", host: "portal.empresa.com" });
    const destroySession = mockDestroySession();
    vi.doMock("next/navigation", () => ({ redirect: mockRedirect() }));

    const { signOutAction } = await import("@/app/dashboard/actions");

    await expect(signOutAction()).rejects.toThrow();
    expect(destroySession).not.toHaveBeenCalled();
  });

  it("continua chamando destroySession() quando Origin e Host coincidem", async () => {
    mockHeaders({ origin: "https://portal.empresa.com", host: "portal.empresa.com" });
    const destroySession = mockDestroySession();
    vi.doMock("next/navigation", () => ({ redirect: mockRedirect() }));

    const { signOutAction } = await import("@/app/dashboard/actions");

    // redirect() lança de propósito (mock) após o destroySession bem-sucedido,
    // como o next/navigation real faz — o que importa aqui é que
    // destroySession() tenha sido chamado antes disso.
    await expect(signOutAction()).rejects.toThrow();
    expect(destroySession).toHaveBeenCalledTimes(1);
  });
});
