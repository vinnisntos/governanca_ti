import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-0",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
