import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  // getUser() revalida o JWT contra o servidor Auth do Supabase — nunca
  // usar getSession() aqui, que aceitaria um cookie local sem revalidação.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
