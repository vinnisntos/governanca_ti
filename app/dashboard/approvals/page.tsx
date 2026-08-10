import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideAccessRequestAction } from "./actions";

type PendingRequestRow = {
  id: string;
  justification: string;
  created_at: string;
  access_catalog: { name: string } | null;
  requester: {
    id: string;
    full_name: string;
    email: string;
    manager_id: string | null;
  } | null;
};

export default async function ApprovalsPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin_ti";

  // A RLS (access_requests_select) já limita o que volta aqui: o próprio
  // usuário só enxerga solicitações de quem ele é gestor direto, ou tudo se
  // for admin_ti/rh. O filtro requester_id != user.id abaixo é só para não
  // listar as próprias solicitações do usuário nesta fila de aprovação.
  const { data: pending } = await supabase
    .from("access_requests")
    .select(
      "id, justification, created_at, access_catalog(name), requester:profiles!access_requests_requester_id_fkey(id, full_name, email, manager_id)"
    )
    .eq("status", "pendente")
    .neq("requester_id", user.id)
    .order("created_at", { ascending: true })
    .returns<PendingRequestRow[]>();

  // Atalho de UX: só mostra os botões de decisão para quem de fato pode
  // decidir (admin_ti ou gestor direto do solicitante). A autoridade real é
  // a policy access_requests_update_approver — se este cálculo estiver
  // errado, o UPDATE simplesmente falha no banco.
  const decidable = (pending ?? []).filter(
    (request) => isAdmin || request.requester?.manager_id === user.id
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Aprovações pendentes</h1>
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

      {decidable.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma solicitação aguardando sua decisão no momento.
        </p>
      ) : (
        <ul className="space-y-4">
          {decidable.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <p className="font-medium">
                {request.access_catalog?.name ?? "Sistema removido"}
              </p>
              <p className="text-sm text-slate-500">
                Solicitado por {request.requester?.full_name} (
                {request.requester?.email})
              </p>
              <p className="mt-2 text-sm text-slate-700">{request.justification}</p>

              <form action={decideAccessRequestAction} className="mt-4 space-y-2">
                <input type="hidden" name="request_id" value={request.id} />
                <label htmlFor={`notes-${request.id}`} className="text-xs font-medium text-slate-500">
                  Observações (obrigatório em caso de recusa)
                </label>
                <textarea
                  id={`notes-${request.id}`}
                  name="review_notes"
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    name="decision"
                    value="aprovado"
                    className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Aprovar
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="negado"
                    className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Recusar
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
