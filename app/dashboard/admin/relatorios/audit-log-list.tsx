"use client";

import * as React from "react";
import { ScrollText } from "lucide-react";
import { ACTION_LABELS } from "./labels";
import type { AuditLogRow } from "./types";
import { formatDateTimeBR } from "@/lib/utils/format-datetime";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";

export function AuditLogList({ logs }: { logs: AuditLogRow[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () =>
      logs.filter((log) =>
        matchesSearch(query, log.profiles?.full_name, log.table_name, ACTION_LABELS[log.action] ?? log.action)
      ),
    [logs, query]
  );

  if (logs.length === 0) {
    return <EmptyState icon={ScrollText} title="Nenhum evento registrado ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por quem, tabela ou ação..."
        aria-label="Buscar na trilha de auditoria"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title={`Nenhum evento encontrado para "${query}"`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">Quando</th>
                <th scope="col" className="px-3 py-2.5">Quem</th>
                <th scope="col" className="px-3 py-2.5">Ação</th>
                <th scope="col" className="px-3 py-2.5">Tabela</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-600">
                    {formatDateTimeBR(log.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-900">{log.profiles?.full_name ?? "—"}</td>
                  <td className="px-3 py-2.5">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="px-3 py-2.5 text-slate-600">{log.table_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
