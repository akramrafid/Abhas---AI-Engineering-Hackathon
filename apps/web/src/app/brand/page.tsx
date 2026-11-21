import type { Metadata } from "next";
import rawTokens from "../../../../../docs/brand/tokens.json";
import {
  BrandShowcase,
  type BrandTokensSpec,
} from "@/features/brand/BrandShowcase";

export const metadata: Metadata = {
  title: "Abhas Brand System (আভাস) — Tokens, Risk Scale & Logo",
  description:
    "Abhas colour tokens, typography scale, WCAG 2.2 AA risk tier system, and logo lockup specifications.",
};

export default function BrandPage() {
  return <BrandShowcase tokens={rawTokens as BrandTokensSpec} />;
}
