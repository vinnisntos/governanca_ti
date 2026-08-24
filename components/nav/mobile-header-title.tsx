"use client";

import { usePathname } from "next/navigation";
import { getNavItems } from "./nav-items";

// O header mobile ficava sempre com o nome da marca ("Governança de TI"),
// obrigando o usuário a abrir o menu para confirmar em que tela está. Aqui
// mostramos o rótulo do item de navegação correspondente à rota atual —
// a marca continua visível no topo do próprio menu (SidebarContent).
export function MobileHeaderTitle({ role }: { role: string | null }) {
  const pathname = usePathname();

  const match = getNavItems(role)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <span className="truncate text-sm font-semibold text-slate-900">
      {match?.label ?? "Governança de TI"}
    </span>
  );
}
