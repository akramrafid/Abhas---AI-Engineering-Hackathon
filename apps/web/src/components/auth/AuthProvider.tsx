import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import {
  AFTER_AUTH_URL,
  AUTH_ENABLED,
  SIGN_IN_URL,
  SIGN_UP_URL,
} from "@/lib/auth-config";

// Clerk's own UI takes the Abhas tokens, so sign-in reads as part of the product.
const appearance = {
  variables: {
    colorPrimary: "var(--color-royal)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-slate)",
    colorBackground: "var(--color-white)",
    colorInput: "var(--color-white)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-mist)",
    colorDanger: "var(--color-risk-high)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-md)",
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={appearance}
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      signInFallbackRedirectUrl={AFTER_AUTH_URL}
      signUpFallbackRedirectUrl={AFTER_AUTH_URL}
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
