import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getAuthUser, getCurrentProfile } from "@/lib/supabase/session";
import { getNavItems } from "@/components/nav/nav-items";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ROLE_LABELS } from "@/lib/constants/role-labels";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // A leitura abaixo só retorna o próprio perfil (ou mais, se admin/gestor/RH)
  // por força da policy `profiles_select` no banco — não por confiança nesta
  // página.
  const profile = await getCurrentProfile();

  const shortcuts = getNavItems(profile?.role ?? null).filter((item) => item.href !== "/dashboard");
  const roleLabel = profile?.role
    ? ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? "Desconhecido"
    : "Desconhecido";

  return (
    <>
      {denied === "admin" ? (
        <Alert tone="warning" className="mb-4">
          Você não tem permissão para acessar essa área.
        </Alert>
      ) : null}

      <PageHeader
        title={`Olá, ${profile?.full_name ?? user.email}`}
        description={`Papel: ${roleLabel}`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group block">
              <Card className="flex h-full items-center gap-3 transition hover:border-primary-300 hover:shadow-popover">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
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
        })}
      </div>
    </>
  );
}
