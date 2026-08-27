"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MAX_RECENT_PAGES, RECENT_PAGES_STORAGE_KEY, readRecentPages } from "@/lib/utils/recent-pages";

// Registra a navegação dentro do /dashboard para alimentar "Continuar de
// onde parou" na Home. Fica no layout (renderiza em toda página filha) em
// vez de em cada página, para não precisar repetir isso página a página.
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/dashboard") return;
    try {
      const current = readRecentPages();
      const next = [pathname, ...current.filter((href) => href !== pathname)].slice(0, MAX_RECENT_PAGES);
      window.localStorage.setItem(RECENT_PAGES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage indisponível — navegação segue normal, só não fica registrada
    }
  }, [pathname]);

  return null;
}
