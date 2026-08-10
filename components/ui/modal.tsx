"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const sizeClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function Modal({
  trigger,
  title,
  description,
  children,
  size = "md",
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: keyof typeof sizeClasses;
}) {
  const [open, setOpen] = React.useState(false);
  const searchParams = useSearchParams();
  // Um submit dentro do modal geralmente termina em redirect(?success=... |
  // ?error=...) na mesma rota — o Next reaproveita a árvore de componentes
  // (só os searchParams mudam), então o Dialog não desmonta sozinho. Por
  // isso fechamos manualmente quando a navegação seguinte a um submit trouxer
  // sucesso, e deixamos aberto em caso de erro (para o usuário corrigir).
  const submittedRef = React.useRef(false);

  React.useEffect(() => {
    if (!submittedRef.current) return;
    submittedRef.current = false;
    if (searchParams.get("success")) {
      setOpen(false);
    }
  }, [searchParams]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 animate-overlay-in" />
        <Dialog.Content
          onSubmit={() => {
            submittedRef.current = true;
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-popover animate-content-in focus:outline-none",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6",
            sizeClasses[size]
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-slate-500">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
