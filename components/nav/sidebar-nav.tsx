"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { getNavGroups } from "./nav-items";

export function SidebarNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const groups = getNavGroups(role);

  // Rotas aninhadas (ex.: /dashboard/admin/hardware e
  // /dashboard/admin/hardware/checkins) casam ambas no prefixo — sem
  // desempate, os dois itens acendiam ativos ao mesmo tempo. Escolhemos só o
  // href mais específico (mais longo) como ativo, igual ao MobileHeaderTitle.
  const activeHref = groups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="space-y-4 px-2">
      {groups.map((group) => (
        <div key={group.label || "geral"} className="space-y-0.5">
          {group.label && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-50 text-primary-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
