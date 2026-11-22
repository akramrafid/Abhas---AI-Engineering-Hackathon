import type { Metadata } from "next";
import rawTokens from "../../../../../docs/brand/tokens.json";
import {
  BrandShowcase,
  type BrandTokensSpec,
} from "@/features/brand/BrandShowcase";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Brand System — Tokens, Risk Scale & Logo",
  description:
    "Abhas colour tokens, typography scale, WCAG 2.2 AA risk tier system, and logo lockup specifications.",
  path: "/brand",
});

export default function BrandPage() {
  return <BrandShowcase tokens={rawTokens as BrandTokensSpec} />;
}
