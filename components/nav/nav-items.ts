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
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export function getNavItems(role: string | null | undefined): NavItem[] {
  const isAdmin = role === "admin_ti";
  const isApprover = isAdmin || role === "gestor";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Início", icon: Home },
    { href: "/dashboard/access-requests", label: "Minhas solicitações", icon: KeyRound },
  ];

  if (isApprover) {
    items.push({ href: "/dashboard/approvals", label: "Aprovações pendentes", icon: ClipboardCheck });
  }
  if (isAdmin) {
    items.push({ href: "/dashboard/admin/catalogo", label: "Catálogo de acessos", icon: ListChecks });
  }

  items.push({ href: "/dashboard/hardware", label: "Meus equipamentos", icon: Laptop });

  if (isAdmin) {
    items.push({ href: "/dashboard/admin/hardware", label: "Inventário de hardware", icon: Boxes });
    items.push({ href: "/dashboard/admin/hardware/checkins", label: "Fila de manutenção", icon: Wrench });
  }

  items.push({ href: "/dashboard/telefonia", label: "Minhas linhas", icon: Phone });

  if (isAdmin) {
    items.push({ href: "/dashboard/admin/telefonia", label: "Telefonia (admin)", icon: PhoneCall });
  }

  items.push({ href: "/dashboard/wiki", label: "Base de conhecimento", icon: BookOpen });

  if (isAdmin) {
    items.push({ href: "/dashboard/admin/relatorios", label: "Dashboard executivo", icon: BarChart3 });
  }

  return items;
}
