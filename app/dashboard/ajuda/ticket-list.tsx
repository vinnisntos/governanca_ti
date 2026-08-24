"use client";

import * as React from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "./labels";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type TicketListRow = {
  id: string;
  category: keyof typeof CATEGORY_LABELS;
  subject: string;
  status: keyof typeof STATUS_LABELS;
  updated_at: string;
  requester?: { full_name: string; email: string } | null;
};

export function TicketList({
  tickets,
  showRequester = false,
  emptyTitle,
  emptyDescription,
}: {
  tickets: TicketListRow[];
  showRequester?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () =>
      tickets.filter((ticket) =>
        matchesSearch(
          query,
          ticket.subject,
          CATEGORY_LABELS[ticket.category],
          ticket.requester?.full_name,
          ticket.requester?.email
        )
      ),
    [tickets, query]
  );

  if (tickets.length === 0) {
    return <EmptyState icon={LifeBuoy} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={showRequester ? "Buscar por assunto, categoria ou solicitante..." : "Buscar por assunto ou categoria..."}
        aria-label="Buscar chamado"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={`Nenhum chamado encontrado para "${query}"`} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/dashboard/ajuda/${ticket.id}`}>
                <Card className="flex items-start justify-between gap-3 transition hover:border-primary-300 hover:shadow-popover">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{ticket.subject}</p>
                    <p className="text-sm text-slate-600">
                      {CATEGORY_LABELS[ticket.category]}
                      {showRequester && ticket.requester
                        ? ` · ${ticket.requester.full_name} (${ticket.requester.email})`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Atualizado em {new Date(ticket.updated_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[ticket.status]} className="shrink-0">
                    {STATUS_LABELS[ticket.status]}
                  </Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
