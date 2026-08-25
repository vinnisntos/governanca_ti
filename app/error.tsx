"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorBoundary({
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <Card className="w-full space-y-4 p-6">
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden />
          <h1 className="text-base font-semibold text-slate-900">Ocorreu um erro inesperado</h1>
          <p className="text-sm text-slate-600">
            Algo deu errado ao carregar esta página. Você pode tentar novamente ou recarregar o
            navegador.
          </p>
        </div>

        {process.env.NODE_ENV !== "production" ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-700">
            {error.message}
          </pre>
        ) : null}

        {error.digest ? (
          <p className="text-xs text-slate-600">Código de referência: {error.digest}</p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton href="/dashboard" variant="ghost">
            Ir para o início
          </LinkButton>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar página
          </Button>
          <Button variant="primary" onClick={() => reset()}>
            Tentar novamente
          </Button>
        </div>
      </Card>
    </div>
  );
}
