"use client";

import { LogOut } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { SubmitButton } from "@/components/ui/submit-button";
import { Going2Logo } from "@/components/ui/going2-logo";

export function SidebarContent({
  role,
  fullName,
  email,
  signOutAction,
}: {
  role: string | null;
  fullName: string | null;
  email: string;
  signOutAction: () => void | Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-2 pb-4">
        <Going2Logo className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold text-slate-900">Governança de TI</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav role={role} />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <p className="truncate px-4 text-sm font-medium text-slate-900">{fullName ?? email}</p>
        <p className="truncate px-4 text-xs capitalize text-slate-600">{role ?? "colaborador"}</p>
        <form action={signOutAction} className="mt-2 px-2">
          <SubmitButton
            variant="ghost"
            size="sm"
            pendingLabel="Saindo..."
            className="w-full justify-start gap-2"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sair
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
