import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCatalogItemAction, toggleCatalogItemActiveAction } from "./actions";

type CatalogRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  departments: { name: string } | null;
};

export default async function AccessCatalogAdminPage({
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

  // O middleware já bloqueia quem não é admin_ti de chegar nesta página; a
  // autoridade real continua sendo a policy access_catalog_write_admin.
  const [{ data: catalog }, { data: departments }] = await Promise.all([
    supabase
      .from("access_catalog")
      .select("id, name, description, is_active, monthly_cost, departments(name)")
      .order("name")
      .returns<CatalogRow[]>(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catálogo de Acessos</h1>
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
          Novo sistema
        </h2>
        <form action={createCatalogItemAction} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Nome do sistema
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ex.: CRM, Figma, ERP"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium">
              Descrição (opcional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="monthly_cost" className="text-sm font-medium">
              Custo mensal da licença (R$, opcional)
            </label>
            <input
              id="monthly_cost"
              name="monthly_cost"
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="owner_department_id" className="text-sm font-medium">
              Departamento responsável (opcional)
            </label>
            <select
              id="owner_department_id"
              name="owner_department_id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Nenhum</option>
              {(departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Adicionar ao catálogo
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Sistemas cadastrados
        </h2>

        {!catalog || catalog.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum sistema cadastrado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {catalog.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.description ? (
                    <p className="text-sm text-slate-600">{item.description}</p>
                  ) : null}
                  {item.departments?.name ? (
                    <p className="text-xs text-slate-400">
                      Depto.: {item.departments.name}
                    </p>
                  ) : null}
                  {item.monthly_cost != null ? (
                    <p className="text-xs text-slate-400">
                      Custo: {Number(item.monthly_cost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                    </p>
                  ) : null}
                </div>

                <form action={toggleCatalogItemActiveAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    type="hidden"
                    name="next_active"
                    value={(!item.is_active).toString()}
                  />
                  <button
                    type="submit"
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {item.is_active ? "Ativo" : "Inativo"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
