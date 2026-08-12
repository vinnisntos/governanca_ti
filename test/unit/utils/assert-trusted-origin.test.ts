import { describe, expect, it, vi } from "vitest";

function mockHeaders(entries: Record<string, string | undefined>) {
  vi.doMock("next/headers", () => ({
    headers: async () => ({
      get: (key: string) => entries[key] ?? null,
    }),
  }));
}

describe("assertTrustedOrigin", () => {
  it("lança quando o header Origin está ausente (ex.: requisição forjada sem navegador)", async () => {
    vi.resetModules();
    mockHeaders({ host: "portal.empresa.com" });
    const { assertTrustedOrigin } = await import(
      "@/lib/utils/assert-trusted-origin"
    );
    await expect(assertTrustedOrigin()).rejects.toThrow();
  });

  it("lança quando Origin não corresponde ao Host (CSRF cross-site)", async () => {
    vi.resetModules();
    mockHeaders({
      origin: "https://atacante.com",
      host: "portal.empresa.com",
    });
    const { assertTrustedOrigin } = await import(
      "@/lib/utils/assert-trusted-origin"
    );
    await expect(assertTrustedOrigin()).rejects.toThrow(
      "Origem da requisição não confiável"
    );
  });

  it("passa quando Origin e Host coincidem", async () => {
    vi.resetModules();
    mockHeaders({
      origin: "https://portal.empresa.com",
      host: "portal.empresa.com",
    });
    const { assertTrustedOrigin } = await import(
      "@/lib/utils/assert-trusted-origin"
    );
    await expect(assertTrustedOrigin()).resolves.toBeUndefined();
  });

  it("subdomínio diferente do Host deve ser rejeitado", async () => {
    vi.resetModules();
    mockHeaders({
      origin: "https://sub.portal.empresa.com",
      host: "portal.empresa.com",
    });
    const { assertTrustedOrigin } = await import(
      "@/lib/utils/assert-trusted-origin"
    );
    await expect(assertTrustedOrigin()).rejects.toThrow();
  });
});
