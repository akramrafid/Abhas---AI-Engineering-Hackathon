interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Renders an XSS-safe JSON-LD script block (escapes `<` as `\u003c`).
 * Used for structured SEO, GEO (AI search), and AEO (Answer Engine) discovery.
 */
export function JsonLd({ data }: JsonLdProps) {
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
