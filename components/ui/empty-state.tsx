import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center",
        className
      )}
    >
      <Icon className="h-7 w-7 text-slate-400" aria-hidden />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
