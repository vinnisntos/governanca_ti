import type { BadgeTone } from "@/components/ui/badge";

export const LINE_TYPE_LABELS: Record<string, string> = {
  sim_fisico: "SIM físico",
  esim: "eSIM",
};

export const STATUS_LABELS = {
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
} as const;

export const STATUS_TONE = {
  ativa: "success",
  suspensa: "warning",
  cancelada: "neutral",
} as const satisfies Record<keyof typeof STATUS_LABELS, BadgeTone>;
