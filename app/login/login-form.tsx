"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginActionState } from "./actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Going2Logo } from "@/components/ui/going2-logo";

const initialState: LoginActionState = { error: null };

// Quem não consegue logar não tem como abrir um chamado na Central de Ajuda
// (ela só existe dentro do dashboard) — este é o único canal para um humano
// do TI nesse cenário específico.
const SUPPORT_EMAIL = "vinnicius.gabriel@going2.com.br";

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const reason = searchParams.get("reason");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-card">
            <Going2Logo className="h-9 w-9" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Portal de Governança de TI</h1>
          <p className="mt-1 text-sm text-slate-600">Acesso restrito a colaboradores.</p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <input type="hidden" name="next" value={next ?? ""} />

          {reason === "inactive" ? (
            <Alert tone="danger">Sua conta foi desativada. Fale com o TI.</Alert>
          ) : null}

          <Field label="E-mail corporativo" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
            />
          </Field>

          <Field label="Senha" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-600 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <SubmitButton variant="primary" size="lg" pendingLabel="Entrando..." className="w-full">
            Entrar
          </SubmitButton>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Não consegue acessar?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-700 underline-offset-2 hover:underline">
            Fale com o TI
          </a>
        </p>
      </div>
    </main>
  );
}
