import { redirect } from "next/navigation";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Padrão simples de feedback para Server Actions em páginas 100% server-side
// (sem useFormState): redireciona de volta com ?error=/?success= na query,
// lido pela própria page para exibir um banner. Nenhum dado sensível deve
// ser colocado aqui — apenas mensagens genéricas voltadas ao usuário.

export function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export function redirectWithSuccess(path: string, message: string): never {
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
