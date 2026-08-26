"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 font-sans text-slate-900 antialiased">
        <div className="mx-auto w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-card">
          <h1 className="text-base font-semibold">Ocorreu um erro inesperado</h1>
          <p className="text-sm text-slate-600">
            Não foi possível carregar a aplicação. Tente recarregar a página.
          </p>

          {process.env.NODE_ENV !== "production" ? (
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-700">
              {error.message}
            </pre>
          ) : null}

          {error.digest ? (
            <p className="text-xs text-slate-600">Código de referência: {error.digest}</p>
          ) : null}

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Recarregar página
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary-600 px-4 text-sm font-semibold text-slate-900 hover:bg-primary-500"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
