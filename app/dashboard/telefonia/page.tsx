import { Phone } from "lucide-react";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const LINE_TYPE_LABELS: Record<string, string> = {
  sim_fisico: "SIM físico",
  esim: "eSIM",
};

const STATUS_LABELS = {
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
} as const;

const STATUS_TONE = {
  ativa: "success",
  suspensa: "warning",
  cancelada: "neutral",
} as const;

type MobileLineRow = {
  id: string;
  phone_number: string;
  carrier: string;
  plan_name: string;
  line_type: string;
  status: keyof typeof STATUS_LABELS;
};

export default async function TelefoniaPage() {
  const session = await getSession();

  // Sem RLS: esta página sempre mostra só as linhas do próprio usuário (é a
  // tela "Minhas linhas", não a de administração) — o filtro é explícito
  // aqui, igual já era antes (a query já filtrava por assigned_to mesmo com
  // RLS ativo).
  const { rows: lines } = await pool.query<MobileLineRow>(
    `select id, phone_number, carrier, plan_name, line_type, status
     from mobile_lines
     where assigned_to = $1`,
    [session!.id]
  );

  return (
    <>
      <PageHeader
        title="Minhas linhas telefônicas"
        description="Linhas telefônicas corporativas vinculadas ao seu usuário."
      />

      {lines.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="Nenhuma linha vinculada"
          description="Nenhuma linha telefônica corporativa está vinculada ao seu usuário no momento."
        />
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id}>
              <Card className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{line.phone_number}</p>
                  <p className="text-sm text-slate-600">
                    {line.carrier} — {line.plan_name} ({LINE_TYPE_LABELS[line.line_type] ?? line.line_type})
                  </p>
                </div>
                <Badge tone={STATUS_TONE[line.status]}>{STATUS_LABELS[line.status]}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
