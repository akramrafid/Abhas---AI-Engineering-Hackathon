"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

// Register once for the whole client bundle.
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** Brand motion: exponential ease-out, never bouncy. */
export const EASE_OUT = "expo.out";

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export const FULL_MOTION = "(prefers-reduced-motion: no-preference)";

export { gsap, ScrollTrigger, SplitText, useGSAP };
