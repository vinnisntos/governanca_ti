"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 6000;

// Sem realtime no Postgres puro: revalida a página em intervalo curto pra
// simular atualização automática da conversa. router.refresh() só busca de
// novo os Server Components — não perde estado de formulário client (ex.: o
// texto já digitado no ReplyForm) nem navega de verdade.
export function TicketAutoRefresh() {
  const router = useRouter();

  React.useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    const interval = setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
