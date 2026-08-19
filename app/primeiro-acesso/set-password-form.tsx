"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { setInitialPasswordAction, type SetPasswordActionState } from "./actions";
import { signOutAction } from "@/app/dashboard/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

const initialState: SetPasswordActionState = { error: null };

export function SetPasswordForm() {
  const [state, formAction] = useFormState(setInitialPasswordAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-card">
            <KeyRound className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Defina sua senha</h1>
          <p className="mt-1 text-sm text-slate-500">
            Este é seu primeiro acesso. Por segurança, escolha uma senha só sua antes de continuar.
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <Field label="Nova senha" htmlFor="password" required hint="Mínimo de 8 caracteres">
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field label="Confirme a nova senha" htmlFor="confirm_password" required>
            <Input
              id="confirm_password"
              name="confirm_password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <SubmitButton variant="primary" size="lg" pendingLabel="Salvando..." className="w-full">
            Definir senha e continuar
          </SubmitButton>
        </form>

        <form action={signOutAction} className="mt-4 text-center">
          <button type="submit" className="text-sm text-slate-500 underline-offset-4 hover:underline">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
