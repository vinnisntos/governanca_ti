import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { inputClassName } from "./input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(inputClassName, "pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
