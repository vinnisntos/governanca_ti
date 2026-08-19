import type { BadgeTone } from "@/components/ui/badge";

export const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebook",
  desktop: "Desktop",
  monitor: "Monitor",
  periferico: "Periférico",
  celular: "Celular",
  outro: "Outro",
};

export const STATUS_LABELS = {
  em_estoque: "Em estoque",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  baixado: "Baixado",
  extraviado: "Extraviado",
} as const;

export const STATUS_TONE = {
  em_estoque: "neutral",
  em_uso: "success",
  em_manutencao: "warning",
  baixado: "neutral",
  extraviado: "danger",
} as const satisfies Record<keyof typeof STATUS_LABELS, BadgeTone>;
