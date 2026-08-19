"use client";

import * as React from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mostrado uma única vez, logo após criar um usuário ou redefinir a senha
// dele (ver lib/utils/temp-password-flash.ts) — o cookie que alimenta isso
// expira em 30s, então esta senha não fica recuperável depois de fechado.
export function TempPasswordAlert({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API pode falhar (ex.: contexto não seguro); o admin ainda
      // consegue selecionar e copiar a senha manualmente do texto exibido.
    }
  }

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div className="flex-1 space-y-2">
        <p className="font-medium">Senha provisória gerada para {email}</p>
        <p className="text-amber-800">
          Repasse esta senha ao usuário por um canal seguro. Ela só é exibida agora — no primeiro
          login, ele será obrigado a trocá-la.
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900">
            {password}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
