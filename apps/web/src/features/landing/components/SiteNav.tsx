"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { clsx } from "clsx";
import { AbhasLogo } from "@/components/brand/AbhasLogo";
import { gsap } from "@/components/motion/gsap";

const LINKS = [
  { id: "rain-clock", href: "#rain-clock", label: "Product tour" },
  { id: "how", href: "#how", label: "How it works" },
  { id: "outputs", href: "#outputs", label: "What officers get" },
  { id: "proof", href: "#proof", label: "Evidence" },
  { id: "faq", href: "#faq", label: "FAQ" },
] as const;

type LinkId = (typeof LINKS)[number]["id"];

/**
 * Floating liquid-glassmorphism header with:
 * - Multi-layered optical frosting, prismatic rim, and pointer-tracked specular refraction
 * - Magnetic sliding glass pill indicator that tracks active scroll section and pointer hover
 * - Silky GSAP smooth-scroll navigation with instant cancellation on manual scroll
 * - Scroll progress thread + full mobile liquid-glass drawer + WCAG 2.2 AA contrast
 */
export function SiteNav({ actions }: { actions: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeId, setActiveId] = useState<LinkId | null>(null);
  const [hoveredId, setHoveredId] = useState<LinkId | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 50, active: false });
  const [navPulse, setNavPulse] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const navTrackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const linkRefs = useRef<Map<LinkId, HTMLAnchorElement>>(new Map());
  const scrollTweenRef = useRef<gsap.core.Tween | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  // Track scroll depth & subtle progress bar.
  useEffect(() => {
    let rafId = 0;
    const updateScroll = () => {
      rafId = 0;
      const y = window.scrollY;
      setIsScrolled(y > 24);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setScrollProgress(Math.min(1, Math.max(0, y / maxScroll)));
      if (y < 140) {
        setActiveId(null);
      }
    };
    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(updateScroll);
    };
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Track which section is currently in view for the magnetic pill.
  useEffect(() => {
    const elements = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const visibleRatios = new Map<LinkId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id as LinkId;
          visibleRatios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best: LinkId | null = null;
        let bestRatio = 0;
        for (const link of LINKS) {
          const ratio = visibleRatios.get(link.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = link.id;
          }
        }
        if (best) setActiveId(best);
      },
      {
        rootMargin: "-22% 0px -52% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Cancel programmatic scroll immediately if user manually scrolls or touches.
  useEffect(() => {
    const cancelTween = () => {
      if (scrollTweenRef.current) {
        scrollTweenRef.current.kill();
        scrollTweenRef.current = null;
      }
    };
    window.addEventListener("wheel", cancelTween, { passive: true });
    window.addEventListener("touchstart", cancelTween, { passive: true });
    return () => {
      window.removeEventListener("wheel", cancelTween);
      window.removeEventListener("touchstart", cancelTween);
      cancelTween();
    };
  }, []);

  // Close mobile menu on Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Animate the magnetic liquid glass indicator pill to hovered or active link.
  const targetPillId = hoveredId ?? activeId;
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const track = navTrackRef.current;
    if (!pill || !track) return;

    const targetLink = targetPillId ? linkRefs.current.get(targetPillId) : null;
    if (!targetLink) {
      gsap.to(pill, {
        opacity: 0,
        scale: 0.92,
        duration: 0.28,
        ease: "power2.out",
        overwrite: "auto",
      });
      return;
    }

    const trackRect = track.getBoundingClientRect();
    const linkRect = targetLink.getBoundingClientRect();
    const x = linkRect.left - trackRect.left;
    const width = linkRect.width;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      gsap.set(pill, { x, width, opacity: 1, scale: 1 });
    } else {
      gsap.to(pill, {
        x,
        width,
        opacity: 1,
        scale: 1,
        duration: 0.52,
        ease: "expo.out",
        overwrite: "auto",
      });
    }
  }, [targetPillId, isScrolled]);

  // Pointer tracking for liquid specular highlight across the glass capsule.
  const handlePointerMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = capsuleRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPointer({ x, y, active: true });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setPointer((prev) => ({ ...prev, active: false }));
  }, []);

  const triggerPulse = useCallback(() => {
    setNavPulse(true);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setNavPulse(false), 650);
  }, []);

  // Smooth GSAP scroll to any section (or top of page).
  const smoothScrollTo = useCallback(
    (targetY: number, hash?: string) => {
      if (scrollTweenRef.current) {
        scrollTweenRef.current.kill();
        scrollTweenRef.current = null;
      }

      const clampedY = Math.max(
        0,
        Math.min(targetY, document.documentElement.scrollHeight - window.innerHeight),
      );
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (hash !== undefined) {
        window.history.replaceState(null, "", hash || window.location.pathname);
      }

      if (reducedMotion || Math.abs(window.scrollY - clampedY) < 4) {
        window.scrollTo({ top: clampedY, behavior: "instant" });
        return;
      }

      const distance = Math.abs(clampedY - window.scrollY);
      const duration = Math.min(1.15, Math.max(0.55, distance / 2400));
      const proxy = { y: window.scrollY };

      scrollTweenRef.current = gsap.to(proxy, {
        y: clampedY,
        duration,
        ease: "power3.inOut",
        onUpdate: () => {
          window.scrollTo({ top: proxy.y, behavior: "instant" });
        },
        onComplete: () => {
          scrollTweenRef.current = null;
        },
      });
    },
    [],
  );

  const handleSectionClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, link: (typeof LINKS)[number]) => {
      const target = document.getElementById(link.id);
      if (!target) return;

      e.preventDefault();
      setActiveId(link.id);
      setMobileMenuOpen(false);
      triggerPulse();

      // Account for floating capsule clearance (rain-clock is sticky full-viewport so align closer to top).
      const headerOffset = link.id === "rain-clock" ? 0 : 88;
      const targetY = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      smoothScrollTo(targetY, link.href);
    },
    [smoothScrollTo, triggerPulse],
  );

  const handleLogoClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (window.location.pathname === "/") {
        e.preventDefault();
        setActiveId(null);
        setMobileMenuOpen(false);
        triggerPulse();
        smoothScrollTo(0, "");
      }
    },
    [smoothScrollTo, triggerPulse],
  );

  const pointerVars = {
    "--glass-x": `${pointer.x}%`,
    "--glass-y": `${pointer.y}%`,
  } as CSSProperties;

  return (
    <header
      ref={headerRef}
      className={clsx(
        "fixed inset-x-0 top-0 z-40 px-3 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-6",
        isScrolled ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-5",
      )}
    >
      <div
        ref={capsuleRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        style={pointerVars}
        className={clsx(
          "group/nav relative mx-auto overflow-hidden rounded-[22px] border transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:rounded-full",
          isScrolled ? "max-w-5xl liquid-glass-bar-scrolled" : "max-w-6xl liquid-glass-bar",
          navPulse ? "border-royal/70" : "border-white/15",
        )}
      >
        {/* Top prismatic light-catch rim */}
        <span
          aria-hidden="true"
          className="liquid-prismatic-rim pointer-events-none absolute inset-x-4 top-0 h-px opacity-85"
        />

        {/* Ambient slow caustic liquid sweep across glass */}
        <span
          aria-hidden="true"
          className="liquid-caustic-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-60"
        />

        {/* Pointer-tracked radial liquid specular glow */}
        <span
          aria-hidden="true"
          className={clsx(
            "pointer-events-none absolute inset-0 transition-opacity duration-500",
            pointer.active ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "radial-gradient(280px circle at var(--glass-x) var(--glass-y), rgba(255,255,255,0.14), rgba(47,91,255,0.12) 40%, transparent 75%)",
          }}
        />

        {/* Navigation pulse ripple ring on click */}
        <span
          aria-hidden="true"
          className={clsx(
            "pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-500",
            navPulse ? "opacity-100" : "opacity-0",
          )}
          style={{
            boxShadow: "inset 0 0 28px rgba(47, 91, 255, 0.35), inset 0 1px 0 rgba(212, 245, 60, 0.5)",
          }}
        />

        {/* Main bar content */}
        <div
          className={clsx(
            "relative z-10 flex items-center justify-between gap-3 px-4 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-6",
            isScrolled ? "h-14" : "h-16",
          )}
        >
          <Link
            href="/"
            onClick={handleLogoClick}
            className="group/logo relative flex items-center rounded-full py-1 pr-2 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-royal"
          >
            <AbhasLogo variant="reverse" size="sm" showBangla />
            <span className="sr-only">Abhas home</span>
          </Link>

          {/* Desktop nav with magnetic liquid-glass sliding pill */}
          <nav
            aria-label="Main"
            className="hidden lg:block"
            onMouseLeave={() => setHoveredId(null)}
          >
            <div
              ref={navTrackRef}
              className="relative flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            >
              {/* Sliding liquid glass indicator (kept outside <ul> for strict WCAG list semantics) */}
              <span
                ref={pillRef}
                aria-hidden="true"
                className="liquid-glass-pill pointer-events-none absolute inset-y-1 left-0 rounded-full opacity-0"
                style={{ width: 0 }}
              />

              <ul className="relative flex items-center gap-0.5">
                {LINKS.map((link) => {
                  const isActive = activeId === link.id;
                  const isFocused = targetPillId === link.id;
                  return (
                    <li key={link.href} className="relative z-10">
                      <a
                        ref={(el) => {
                          if (el) linkRefs.current.set(link.id, el);
                          else linkRefs.current.delete(link.id);
                        }}
                        href={link.href}
                        aria-current={isActive ? "location" : undefined}
                        onMouseEnter={() => setHoveredId(link.id)}
                        onFocus={() => setHoveredId(link.id)}
                        onBlur={() => setHoveredId(null)}
                        onClick={(e) => handleSectionClick(e, link)}
                        className={clsx(
                          "relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-300 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-royal",
                          isFocused ? "text-white" : "text-mist hover:text-white",
                        )}
                      >
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(212,245,60,0.9)]"
                          />
                        ) : null}
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          {/* Right actions + mobile glass toggle */}
          <div className="flex items-center gap-2">
            {actions}

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/15 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Hairline scroll-progress thread along bottom glass edge */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] bg-white/[0.06]">
          <div
            className="h-full origin-left bg-gradient-to-r from-royal via-royal to-lime transition-transform duration-150 ease-out"
            style={{ transform: `scaleX(${scrollProgress})` }}
          />
        </div>

        {/* Mobile liquid-glass expandable drawer */}
        <div
          aria-hidden={!mobileMenuOpen}
          className={clsx(
            "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
            mobileMenuOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <nav
              aria-label="Mobile Navigation"
              className="border-t border-white/10 px-3 py-3"
            >
              <ul className="flex flex-col gap-1">
                {LINKS.map((link) => {
                  const isActive = activeId === link.id;
                  return (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        tabIndex={mobileMenuOpen ? 0 : -1}
                        aria-current={isActive ? "location" : undefined}
                        onClick={(e) => handleSectionClick(e, link)}
                        className={clsx(
                          "flex min-h-11 items-center justify-between rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-300",
                          isActive
                            ? "liquid-glass-pill text-white"
                            : "text-mist hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <span>{link.label}</span>
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(212,245,60,0.9)]"
                          />
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
