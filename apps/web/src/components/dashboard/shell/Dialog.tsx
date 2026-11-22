"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

/** Native modal <dialog>: focus trap, Esc and backdrop close come from the platform. */
export function Dialog({ title, onClose, children, testId }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    // No close() in cleanup: StrictMode re-runs effects, and a close event would unmount the dialog.
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[min(calc(100%-1.5rem),32rem)] rounded-[14px] bg-white p-0 text-ink shadow-2xl shadow-ink/40 ring-1 ring-mist backdrop:bg-ink/50"
    >
      <div className="p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-h2 font-bold text-navy">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => ref.current?.close()}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-full text-slate transition-colors hover:bg-paper hover:text-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
