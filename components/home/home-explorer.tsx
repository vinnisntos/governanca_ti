"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, History, Search, SearchX } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { readRecentPages } from "@/lib/utils/recent-pages";
import { getFlatNavItems, type FlatNavItem } from "@/components/nav/nav-items";
import { Card } from "@/components/ui/card";

// Recebe `role` (serializável) em vez dos itens já resolvidos: um NavItem
// carrega o componente do ícone (função), e funções não podem atravessar a
// fronteira Server → Client Component como prop — só a chave (role) pode.
// A resolução dos itens (com ícones) acontece aqui dentro, já em código client.
export function HomeExplorer({ role, greetingName }: { role: string | null; greetingName: string }) {
  const [query, setQuery] = React.useState("");
  const [recentHrefs, setRecentHrefs] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const items = React.useMemo(
    () => getFlatNavItems(role).filter((item) => item.href !== "/dashboard"),
    [role]
  );

  React.useEffect(() => {
    setRecentHrefs(readRecentPages());
  }, []);

  // Atalho "/" para focar a busca, como em Gmail/Notion/Linear — só quando o
  // foco não está em outro campo de digitação.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const trimmedQuery = query.trim();
  const results = React.useMemo(() => {
    if (!trimmedQuery) return [];
    return items.filter((item) => matchesSearch(trimmedQuery, item.label, item.group, ...(item.keywords ?? [])));
  }, [items, trimmedQuery]);

  const recentItems = recentHrefs
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is FlatNavItem => Boolean(item));

  const groupedItems = React.useMemo(() => {
    const groups = new Map<string, FlatNavItem[]>();
    for (const item of items) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, [items]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        O que vamos fazer hoje, {greetingName}?
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Busque uma página, uma solicitação ou uma dúvida — ou escolha um atalho abaixo.
      </p>

      <div className="relative mt-6 w-full">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar acessos, hardware, chamados, artigos..."
          className="w-full rounded-full border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 shadow-card transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
        />
        <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600 sm:inline-block">
          /
        </kbd>
      </div>

      <div className="mt-8 w-full text-left">
        {trimmedQuery ? (
          <div key="results" className="animate-content-in space-y-1.5">
            {results.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 py-10 text-center">
                <SearchX className="h-6 w-6 text-slate-600" aria-hidden />
                <p className="text-sm font-medium text-slate-700">
                  Nada encontrado para &ldquo;{trimmedQuery}&rdquo;
                </p>
                <p className="text-sm text-slate-600">
                  Tente outro termo ou{" "}
                  <Link href="/dashboard/ajuda" className="font-medium text-primary-700 hover:underline">
                    abra um chamado para o TI
                  </Link>
                  .
                </p>
              </Card>
            ) : (
              results.map((item) => <ResultRow key={item.href} item={item} />)
            )}
          </div>
        ) : (
          <div key="browse" className="animate-content-in space-y-8">
            {recentItems.length > 0 ? (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Continuar de onde parou
                </h2>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {recentItems.map((item) => (
                    <ShortcutCard key={item.href} item={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {groupedItems.map(([group, groupItems]) => (
              <section key={group}>
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{group}</h2>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {groupItems.map((item) => (
                    <ShortcutCard key={item.href} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShortcutCard({ item }: { item: FlatNavItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="group block">
      <Card className="flex h-full items-center gap-3 py-3.5 transition hover:border-primary-300 hover:shadow-popover">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <p className="flex-1 text-sm font-medium text-slate-900">{item.label}</p>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500"
          aria-hidden
        />
      </Card>
    </Link>
  );
}

function ResultRow({ item }: { item: FlatNavItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="group block">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition",
          "hover:border-slate-200 hover:bg-white hover:shadow-card"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{item.label}</p>
          <p className="truncate text-xs text-slate-600">{item.group}</p>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500"
          aria-hidden
        />
      </div>
    </Link>
  );
}
