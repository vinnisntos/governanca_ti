import { redirect } from "next/navigation";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { HomeExplorer } from "@/components/home/home-explorer";
import { Alert } from "@/components/ui/alert";

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

  const profile = await getCurrentProfile();

  const fullNameOrEmail = profile?.full_name ?? user.email;
  const greetingName = fullNameOrEmail.split(" ")[0] || fullNameOrEmail;

  return (
    <>
      {denied === "admin" ? (
        <Alert tone="warning" className="mb-4">
          Você não tem permissão para acessar essa área.
        </Alert>
      ) : null}

      <HomeExplorer role={profile?.role ?? null} greetingName={greetingName} />
    </>
  );
}
