"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "@/components/icons";
import { clsx } from "clsx";
import { Dialog } from "@/components/dashboard/shell/Dialog";
import { AUTH_ENABLED } from "@/lib/auth-config";
import type { Lang } from "@/lib/i18n";

export interface LogoutConfirmDialogProps {
  lang: Lang;
  onClose: () => void;
}

function LogoutDialogBody({
  lang,
  busy,
  onConfirm,
  onClose,
}: {
  lang: Lang;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const bn = lang === "bn";
  return (
    <Dialog
      title={bn ? "আভাস থেকে লগআউট করবেন?" : "Log out of Abhas?"}
      onClose={onClose}
      testId="logout-confirm-dialog"
    >
      <p lang={lang} className={clsx("text-sm leading-6 text-slate", bn && "font-bangla")}>
        {bn
          ? "আপনি লগআউট হয়ে মূল ল্যান্ডিং পেজে ফিরে যাবেন। পরে যেকোনো সময় আবার সাইন ইন করতে পারবেন।"
          : "You will be logged out of your dashboard session and returned to the Abhas landing page."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          data-testid="logout-cancel"
          lang={lang}
          className={clsx(
            "inline-flex min-h-10 cursor-pointer items-center rounded-full border border-mist bg-white px-4 text-sm font-semibold text-navy transition-colors hover:bg-paper disabled:opacity-50",
            bn && "font-bangla",
          )}
        >
          {bn ? "না, থাকুন" : "Cancel"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          data-testid="logout-confirm"
          lang={lang}
          className={clsx(
            "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white transition-colors hover:bg-navy disabled:opacity-60",
            bn && "font-bangla",
          )}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {busy
            ? bn
              ? "লগআউট হচ্ছে…"
              : "Logging out…"
            : bn
              ? "হ্যাঁ, লগআউট করুন"
              : "Yes, log out"}
        </button>
      </div>
    </Dialog>
  );
}

function ClerkLogoutConfirmDialog({ lang, onClose }: LogoutConfirmDialogProps) {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  const handleConfirm = () => {
    setBusy(true);
    void signOut({ redirectUrl: "/" }).catch(() => {
      window.location.assign("/");
    });
  };

  return (
    <LogoutDialogBody
      lang={lang}
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}

function OfflineLogoutConfirmDialog({ lang, onClose }: LogoutConfirmDialogProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleConfirm = () => {
    setBusy(true);
    onClose();
    router.push("/");
  };

  return (
    <LogoutDialogBody
      lang={lang}
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}

/** Confirmation modal triggered when clicking the dashboard brand logo to log out and return to `/`. */
export function LogoutConfirmDialog(props: LogoutConfirmDialogProps) {
  if (!AUTH_ENABLED) {
    return <OfflineLogoutConfirmDialog {...props} />;
  }
  return <ClerkLogoutConfirmDialog {...props} />;
}
