import type { BadgeTone } from "@/components/ui/badge";

export const CATEGORY_LABELS = {
  acesso: "Acessos",
  hardware: "Hardware",
  telefonia: "Telefonia",
  conta: "Conta / login",
  outro: "Outro",
} as const;

export const STATUS_LABELS = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
  cancelado: "Cancelado",
} as const;

export const STATUS_TONE = {
  aberto: "warning",
  em_andamento: "info",
  resolvido: "success",
  fechado: "neutral",
  cancelado: "danger",
} as const satisfies Record<keyof typeof STATUS_LABELS, BadgeTone>;
