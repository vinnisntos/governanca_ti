"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils/cn";
import { Button, type ButtonProps } from "./button";

/**
 * A form submit button that asks for confirmation first. Must be rendered
 * inside the <form> it should submit. The visible trigger is a plain
 * type="button" (so Radix's own click handling opens the dialog — calling
 * preventDefault in a handler on the trigger would make Radix skip its own
 * open logic, since it checks event.defaultPrevented). A hidden real submit
 * button carries the same name/value pair (e.g. decision=negado) and is
 * clicked programmatically on confirm, replaying a native submission.
 */
export function ConfirmSubmitButton({
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "destructive",
  className,
  children,
  name,
  value,
  ...buttonProps
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
} & ButtonProps) {
  const hiddenSubmitRef = React.useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant={variant} className={className} {...buttonProps}>
          {children}
        </Button>
      </AlertDialog.Trigger>
      <button
        ref={hiddenSubmitRef}
        type="submit"
        name={name}
        value={value}
        tabIndex={-1}
        aria-hidden
        className="hidden"
      />
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 animate-overlay-in" />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-popover animate-content-in focus:outline-none sm:p-6"
          )}
        >
          <AlertDialog.Title className="text-base font-semibold text-slate-900">
            {title}
          </AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-1.5 text-sm text-slate-600">
              {description}
            </AlertDialog.Description>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={variant} onClick={() => hiddenSubmitRef.current?.click()}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
