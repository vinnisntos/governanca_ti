import * as React from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { badgeClassName, type BadgeTone } from "./badge";

// Alterna um status via submit de formulário, mas com affordance de controle
// interativo (ícone de toggle + hover/focus) — um <Badge> comum ao lado teria
// a mesma aparência de algo puramente informativo e não clicável.
export function StatusToggleButton({
  active,
  activeLabel,
  inactiveLabel,
  actionLabel,
  activeTone = "success",
  inactiveTone = "neutral",
  className,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  actionLabel: string;
  activeTone?: BadgeTone;
  inactiveTone?: BadgeTone;
  className?: string;
}) {
  const Icon = active ? ToggleRight : ToggleLeft;

  return (
    <button
      type="submit"
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(
        badgeClassName(active ? activeTone : inactiveTone),
        "gap-1 border border-black/5 shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}
