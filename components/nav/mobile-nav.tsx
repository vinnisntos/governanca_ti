"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarContent } from "./sidebar-content";

export function MobileNav({
  role,
  fullName,
  email,
  signOutAction,
}: {
  role: string | null;
  fullName: string | null;
  email: string;
  signOutAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Abrir menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 animate-overlay-in lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white p-4 shadow-popover animate-content-in focus:outline-none lg:hidden">
          <div className="mb-2 flex items-center justify-end">
            <Dialog.Close
              aria-label="Fechar menu"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Menu de navegação</Dialog.Title>
          <SidebarContent
            role={role}
            fullName={fullName}
            email={email}
            signOutAction={signOutAction}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
