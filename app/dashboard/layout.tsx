import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAuthUser, getCurrentProfile } from "@/lib/supabase/session";
import { signOutAction } from "./actions";
import { SidebarContent } from "@/components/nav/sidebar-content";
import { MobileNav } from "@/components/nav/mobile-nav";
import { MobileHeaderTitle } from "@/components/nav/mobile-header-title";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();

  const role = profile?.role ?? null;
  const fullName = profile?.full_name ?? null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-popover"
      >
        Pular para o conteúdo
      </a>

      <aside className="hidden border-r border-slate-200 bg-white px-2 py-4 lg:flex lg:flex-col">
        <SidebarContent role={role} fullName={fullName} email={user.email ?? ""} signOutAction={signOutAction} />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <MobileNav role={role} fullName={fullName} email={user.email ?? ""} signOutAction={signOutAction} />
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" aria-hidden />
            <MobileHeaderTitle role={role} />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
