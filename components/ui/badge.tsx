import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
};

export function badgeClassName(tone: BadgeTone, className?: string) {
  return cn(
    "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
    toneClasses[tone],
    className
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={badgeClassName(tone, className)} {...props} />;
}
