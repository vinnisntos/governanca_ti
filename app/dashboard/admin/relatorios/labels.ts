export const ACCESS_REQUEST_STATUSES = [
  "pendente",
  "em_analise",
  "aprovado",
  "negado",
  "cancelado",
] as const;

export const ACCESS_STATUS_LABELS = {
  pendente: "Pendentes",
  em_analise: "Em análise",
  aprovado: "Aprovadas",
  negado: "Negadas",
  cancelado: "Canceladas",
} as const;

export const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};
