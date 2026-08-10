import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAccessRequestAction, cancelAccessRequestAction } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
  cancelado: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800",
  em_analise: "bg-blue-100 text-blue-800",
  aprovado: "bg-green-100 text-green-800",
  negado: "bg-red-100 text-red-800",
  cancelado: "bg-slate-200 text-slate-600",
};

type AccessRequestRow = {
  id: string;
  justification: string;
  status: keyof typeof STATUS_LABELS;
  review_notes: string | null;
  decision_at: string | null;
  created_at: string;
  access_catalog: { name: string } | null;
};

export default async function AccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: catalog }, { data: requests }] = await Promise.all([
    supabase
      .from("access_catalog")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("access_requests")
      .select(
        "id, justification, status, review_notes, decision_at, created_at, access_catalog(name)"
      )
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false })
      .returns<AccessRequestRow[]>(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Minhas solicitações de acesso</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
          Voltar
        </Link>
      </div>

      {errorMessage ? (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </p>
      ) : null}

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Nova solicitação
        </h2>

        {!catalog || catalog.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum sistema disponível no catálogo ainda. Peça ao admin de TI para
            cadastrar em Catálogo de Acessos.
          </p>
        ) : (
          <form action={createAccessRequestAction} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="system_id" className="text-sm font-medium">
                Sistema
              </label>
              <select
                id="system_id"
                name="system_id"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {catalog.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="justification" className="text-sm font-medium">
                Justificativa
              </label>
              <textarea
                id="justification"
                name="justification"
                required
                minLength={10}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Explique por que você precisa deste acesso"
              />
            </div>

            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Enviar solicitação
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Histórico</h2>

        {!requests || requests.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma solicitação registrada.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {request.access_catalog?.name ?? "Sistema removido"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {request.justification}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[request.status]}`}
                  >
                    {STATUS_LABELS[request.status]}
                  </span>
                </div>

                {request.status === "negado" && request.review_notes ? (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    Motivo da recusa: {request.review_notes}
                  </p>
                ) : null}

                {request.status === "pendente" ? (
                  <form action={cancelAccessRequestAction} className="mt-3">
                    <input type="hidden" name="request_id" value={request.id} />
                    <button
                      type="submit"
                      className="text-sm text-slate-500 underline"
                    >
                      Cancelar solicitação
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
