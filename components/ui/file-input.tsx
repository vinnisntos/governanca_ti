import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const FileInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="file"
    className={cn(
      "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:transition-colors hover:file:bg-slate-200",
      className
    )}
    {...props}
  />
));
FileInput.displayName = "FileInput";
