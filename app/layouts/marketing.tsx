import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import Lenis from "lenis";

import { Navbar } from "~/components/layout/Navbar";
import { Footer } from "~/components/layout/Footer";

/** Public pages: smooth-scrolled narrative layout with header and footer. */
export default function MarketingLayout() {
  const isHome = useLocation().pathname === "/";

  useEffect(() => {
    // Hijacking the scroll is a comfort choice, so users who asked the OS for less motion keep the browser's native scrolling.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
    });

    let rafId: number;

    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full terminal-grid marketing-grid-mask opacity-20"
        aria-hidden="true"
      />

      {!isHome && <Navbar />}
      <main className="grow">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
