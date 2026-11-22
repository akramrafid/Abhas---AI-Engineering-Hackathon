"use client";

import dynamic from "next/dynamic";

const AbhasChatWidget = dynamic(
  () => import("./AbhasChatWidget").then((mod) => mod.AbhasChatWidget),
  { ssr: false },
);

/** Defers the floating AI assistant widget off the initial critical JS bundle. */
export function LazyChatWidget() {
  return <AbhasChatWidget />;
}
