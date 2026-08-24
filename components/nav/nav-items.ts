import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ClipboardCheck,
  Home,
  KeyRound,
  Laptop,
  LifeBuoy,
  ListChecks,
  Phone,
  PhoneCall,
  ShieldCheck,
  ShieldX,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Grupos "de autoatendimento" (Acessos, Hardware, Telefonia, Conhecimento)
// listam só o que qualquer colaborador usa no dia a dia. Tudo que é
// back-office — configurar catálogo, inventário, usuários etc. — fica
// isolado em "Administração" para não misturar "meu uso" com "eu administro
// isso para a empresa toda" sob o mesmo rótulo de grupo.
export function getNavGroups(role: string | null | undefined): NavGroup[] {
  const isAdmin = role === "admin_ti";
  const isApprover = isAdmin || role === "gestor";

  const groups: NavGroup[] = [
    {
      label: "",
      items: [{ href: "/dashboard", label: "Início", icon: Home }],
    },
  ];

  const acessos: NavItem[] = [
    { href: "/dashboard/meus-acessos", label: "Meus acessos", icon: ShieldCheck },
    { href: "/dashboard/access-requests", label: "Minhas solicitações", icon: KeyRound },
  ];
  if (isApprover) {
    acessos.push({ href: "/dashboard/approvals", label: "Aprovações pendentes", icon: ClipboardCheck });
  }
  groups.push({ label: "Acessos", items: acessos });

  groups.push({
    label: "Hardware",
    items: [{ href: "/dashboard/hardware", label: "Meus equipamentos", icon: Laptop }],
  });

  groups.push({
    label: "Telefonia",
    items: [{ href: "/dashboard/telefonia", label: "Minhas linhas", icon: Phone }],
  });

  groups.push({
    label: "Conhecimento",
    items: [{ href: "/dashboard/wiki", label: "Base de conhecimento", icon: BookOpen }],
  });

  groups.push({
    label: "Ajuda",
    items: [{ href: "/dashboard/ajuda", label: "Central de Ajuda", icon: LifeBuoy }],
  });

  if (isAdmin) {
    groups.push({
      label: "Administração",
      items: [
        { href: "/dashboard/admin/usuarios", label: "Usuários", icon: Users },
        { href: "/dashboard/admin/departamentos", label: "Departamentos", icon: Building2 },
        { href: "/dashboard/admin/catalogo", label: "Catálogo de acessos", icon: ListChecks },
        { href: "/dashboard/admin/acessos-concedidos", label: "Acessos concedidos", icon: ShieldX },
        { href: "/dashboard/admin/hardware", label: "Inventário de hardware", icon: Boxes },
        { href: "/dashboard/admin/hardware/checkins", label: "Fila de manutenção", icon: Wrench },
        { href: "/dashboard/admin/telefonia", label: "Telefonia (admin)", icon: PhoneCall },
        { href: "/dashboard/admin/chamados", label: "Chamados", icon: LifeBuoy },
        { href: "/dashboard/admin/relatorios", label: "Dashboard executivo", icon: BarChart3 },
      ],
    });
  }

  return groups;
}

export function getNavItems(role: string | null | undefined): NavItem[] {
  return getNavGroups(role).flatMap((group) => group.items);
}
