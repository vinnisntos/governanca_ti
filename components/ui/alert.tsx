import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

// Exportado para telas fora do Alert (ex.: FlashToast) reaproveitarem a
// mesma paleta por tom, em vez de duplicar as cores localmente.
export const toneConfig: Record<
  AlertTone,
  { icon: typeof Info; classes: string; role: "status" | "alert" }
> = {
  info: { icon: Info, classes: "border-blue-200 bg-blue-50 text-blue-800", role: "status" },
  success: { icon: CheckCircle2, classes: "border-green-200 bg-green-50 text-green-800", role: "status" },
  warning: { icon: AlertTriangle, classes: "border-amber-200 bg-amber-50 text-amber-800", role: "alert" },
  danger: { icon: XCircle, classes: "border-red-200 bg-red-50 text-red-700", role: "alert" },
};

export function Alert({
  tone = "info",
  className,
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, classes, role } = toneConfig[tone];

  return (
    <div role={role} className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", classes, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
    </div>
  );
}
