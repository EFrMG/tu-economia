import { useEffect, useRef, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigation,
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/terminal";
import { Sidebar } from "~/components/layout/Sidebar";
import { TopBar } from "~/components/layout/TopBar";
import { SupportDialog } from "~/components/features/SupportDialog";
import { isEquitiesBymaEnabled } from "~/lib/acciones-panels";
import type { TerminalLayoutData } from "~/lib/use-equities-byma-enabled";
import { workerEnvContext } from "~/lib/worker-context";

/** Deploy-time flags the shell and its pages need on the client; the top-bar search index depends on the BYMA one. */
export function loader({ context }: Route.LoaderArgs): TerminalLayoutData {
  return {
    equitiesBymaEnabled: isEquitiesBymaEnabled(context.get(workerEnvContext)),
  };
}

/** The flags only change with a deploy, so navigations and refreshes never need to reload them. */
export function shouldRevalidate() {
  return false;
}

/**
 * Terminal shell: fixed side navigation, a static top bar and a single scrollable canvas, so the chrome never moves while data is being read.
 */
export default function TerminalLayout({ loaderData }: Route.ComponentProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const navTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const previousPathname = useRef(location.pathname);
  const wasNavOpen = useRef(false);
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const isLoading = navigation.state !== "idle" || revalidator.state !== "idle";

  const refresh = () => {
    if (isLoading) return;

    revalidator.revalidate();
  };

  useEffect(() => {
    // The support dialog owns focus while it is open; closing the drawer must not pull focus back to the trigger.
    if (supportOpen) return;

    if (!navOpen) {
      if (wasNavOpen.current) navTriggerRef.current?.focus();

      wasNavOpen.current = false;

      return;
    }

    wasNavOpen.current = true;
    const drawer = drawerRef.current;

    const focusFrame = requestAnimationFrame(() =>
      drawer?.querySelector<HTMLElement>("a[href]")?.focus(),
    );

    const desktop = window.matchMedia("(min-width: 768px)");
    if (desktop.matches) {
      cancelAnimationFrame(focusFrame);
      setNavOpen(false);

      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);

        return;
      }

      if (event.key !== "Tab" || !drawer) return;

      const focusable = [
        ...drawer.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ),
      ].filter((item) => item.getClientRects().length > 0);

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (!drawer.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onResize = () => {
      if (desktop.matches) setNavOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
    };
  }, [navOpen, supportOpen]);

  useEffect(() => {
    const pathnameChanged = previousPathname.current !== location.pathname;
    previousPathname.current = location.pathname;

    // A search result names the section to open at, also on the same page with another query; each target renders, with that id, while its data loads.
    const target = location.hash
      ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
      : null;

    if (target) {
      target.scrollIntoView({ block: "start" });

      return;
    }

    if (!pathnameChanged) return;

    const params = new URLSearchParams(location.search);
    if (params.has("rate")) return;

    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="flex h-dvh overflow-hidden bg-base-950 text-text-100">
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onSupport={() => setSupportOpen(true)}
        drawerRef={drawerRef}
        equitiesBymaEnabled={loaderData.equitiesBymaEnabled}
      />

      <div
        className="flex h-dvh flex-1 flex-col overflow-hidden md:ml-64"
        inert={navOpen}
      >
        <TopBar
          onOpenNav={() => setNavOpen(true)}
          navTriggerRef={navTriggerRef}
          onRefresh={refresh}
          isRefreshing={revalidator.state !== "idle"}
          isLoading={isLoading}
          equitiesBymaEnabled={loaderData.equitiesBymaEnabled}
        />

        <main
          ref={mainRef}
          className="relative flex-1 [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto py-4 md:py-8"
          aria-busy={isLoading}
        >
          <div
            className="pointer-events-none absolute inset-0 terminal-grid opacity-5"
            aria-hidden="true"
          />
          <div className="page-container relative z-10">
            <Outlet />
          </div>
        </main>
      </div>

      <SupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        returnFocusRef={navTriggerRef}
      />
    </div>
  );
}
