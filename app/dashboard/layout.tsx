import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";
import { SidebarContent } from "@/components/nav/sidebar-content";
import { MobileNav } from "@/components/nav/mobile-nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const fullName = profile?.full_name ?? null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-slate-200 bg-white px-2 py-4 lg:flex lg:flex-col">
        <SidebarContent role={role} fullName={fullName} email={user.email ?? ""} signOutAction={signOutAction} />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <MobileNav role={role} fullName={fullName} email={user.email ?? ""} signOutAction={signOutAction} />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-600" aria-hidden />
            <span className="text-sm font-semibold text-slate-900">Governança de TI</span>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
