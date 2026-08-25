"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toneConfig } from "./alert";

const AUTO_DISMISS_MS = 6000;

export function FlashToast({
  success,
  error,
}: {
  success?: string | null;
  error?: string | null;
}) {
  const message = error ?? success ?? null;
  const tone: "success" | "danger" = error ? "danger" : "success";
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(Boolean(message));

  const dismiss = React.useCallback(() => {
    setVisible(false);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  React.useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message || !visible) return null;

  const { icon: Icon, classes, role } = toneConfig[tone];

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex justify-center sm:inset-x-auto sm:right-4 sm:justify-end"
    >
      <div
        role={role}
        className={cn(
          "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-popover animate-toast-in",
          classes
        )}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="flex-1">{message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso"
          className="shrink-0 rounded p-0.5 text-current opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
