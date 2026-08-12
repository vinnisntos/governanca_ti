import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { inputClassName } from "./input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClassName, "resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";
