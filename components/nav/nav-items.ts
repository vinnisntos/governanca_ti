import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Home,
  KeyRound,
  Laptop,
  ListChecks,
  Phone,
  PhoneCall,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export function getNavGroups(role: string | null | undefined): NavGroup[] {
  const isAdmin = role === "admin_ti";
  const isApprover = isAdmin || role === "gestor";

  const groups: NavGroup[] = [
    {
      label: "",
      items: [{ href: "/dashboard", label: "Início", icon: Home }],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: "Usuários",
      items: [{ href: "/dashboard/admin/usuarios", label: "Usuários", icon: Users }],
    });
  }

  const acessos: NavItem[] = [
    { href: "/dashboard/meus-acessos", label: "Meus acessos", icon: ShieldCheck },
    { href: "/dashboard/access-requests", label: "Minhas solicitações", icon: KeyRound },
  ];
  if (isApprover) {
    acessos.push({ href: "/dashboard/approvals", label: "Aprovações pendentes", icon: ClipboardCheck });
  }
  if (isAdmin) {
    acessos.push({ href: "/dashboard/admin/catalogo", label: "Catálogo de acessos", icon: ListChecks });
  }
  groups.push({ label: "Acessos", items: acessos });

  const hardware: NavItem[] = [{ href: "/dashboard/hardware", label: "Meus equipamentos", icon: Laptop }];
  if (isAdmin) {
    hardware.push({ href: "/dashboard/admin/hardware", label: "Inventário de hardware", icon: Boxes });
    hardware.push({ href: "/dashboard/admin/hardware/checkins", label: "Fila de manutenção", icon: Wrench });
  }
  groups.push({ label: "Hardware", items: hardware });

  const telefonia: NavItem[] = [{ href: "/dashboard/telefonia", label: "Minhas linhas", icon: Phone }];
  if (isAdmin) {
    telefonia.push({ href: "/dashboard/admin/telefonia", label: "Telefonia (admin)", icon: PhoneCall });
  }
  groups.push({ label: "Telefonia", items: telefonia });

  groups.push({
    label: "Conhecimento",
    items: [{ href: "/dashboard/wiki", label: "Base de conhecimento", icon: BookOpen }],
  });

  if (isAdmin) {
    groups.push({
      label: "Relatórios",
      items: [{ href: "/dashboard/admin/relatorios", label: "Dashboard executivo", icon: BarChart3 }],
    });
  }

  return groups;
}

export function getNavItems(role: string | null | undefined): NavItem[] {
  return getNavGroups(role).flatMap((group) => group.items);
}
