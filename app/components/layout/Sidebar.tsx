import { useLayoutEffect, useRef, useState, type Ref } from "react";
import type { IconType } from "react-icons";
import {
  MdFavorite,
  MdOutlineAccountBalanceWallet,
  MdOutlineAnalytics,
  MdOutlineCandlestickChart,
  MdOutlineClose,
  MdOutlineDashboard,
  MdOutlineFavoriteBorder,
  MdOutlineHelpOutline,
  MdOutlineNewspaper,
  MdOutlineQueryStats,
} from "react-icons/md";
import { NavLink, useLocation } from "react-router";
import { Wordmark } from "~/components/ui/Wordmark";
import { accionesLabel } from "~/lib/acciones-panels";

interface NavItem {
  label: string;
  icon: IconType;
  /** Sections without a route yet render as inert entries. */
  to?: string;
  /** Entries that open a dialog instead of navigating. */
  onSelect?: () => void;
  /** Filled counterpart revealed while a pointer hovers the entry. */
  hoverIcon?: IconType;
  iconClassName?: string;
  hoverIconClassName?: string;
}

/** `/acciones` is named for what it shows: stock quotations only while BYMA's are enabled. */
const primaryNav = (equitiesBymaEnabled: boolean): NavItem[] => [
  { label: "Dashboard", icon: MdOutlineDashboard, to: "/dashboard" },
  { label: "Análisis", icon: MdOutlineAnalytics, to: "/analisis" },
  { label: "Indicadores", icon: MdOutlineQueryStats, to: "/indicadores" },
  {
    label: accionesLabel(equitiesBymaEnabled),
    icon: MdOutlineCandlestickChart,
    to: "/acciones",
  },
  { label: "Noticias", icon: MdOutlineNewspaper, to: "/noticias" },
  {
    label: "Mi economía",
    icon: MdOutlineAccountBalanceWallet,
    to: "/mi-economia",
  },
];

const secondaryNav = (onSupport: () => void): NavItem[] => [
  { label: "Ayuda", icon: MdOutlineHelpOutline, to: "/docs" },
  {
    label: "Soporte",
    icon: MdOutlineFavoriteBorder,
    hoverIcon: MdFavorite,
    iconClassName: "text-red-text-400",
    hoverIconClassName: "text-red-text-300",
    onSelect: onSupport,
  },
];

const itemBase =
  "font-mono text-label-caps relative z-10 flex items-center gap-3 pl-8 pr-4 uppercase motion-safe:transition-colors duration-250 focus-visible:outline-none";

const itemIdle = "text-text-200 hover:text-text-100";
const itemActive = "text-primary-text-100";
const itemTarget = "bg-surface-900";
const itemDisabled = "text-text-400 cursor-not-allowed";

interface SidebarProps {
  /** Drawer state, only meaningful below the `md` breakpoint. */
  open: boolean;
  onClose: () => void;
  onSupport: () => void;
  drawerRef: Ref<HTMLElement>;
  /** `EQUITIES_BYMA_ENABLED`, from the terminal layout's loader. */
  equitiesBymaEnabled: boolean;
}

const Sidebar = ({
  open,
  onClose,
  onSupport,
  drawerRef,
  equitiesBymaEnabled,
}: SidebarProps) => {
  const location = useLocation();
  const nav = primaryNav(equitiesBymaEnabled);

  const activePath =
    nav.find((item) => item.to === location.pathname)?.to ?? null;

  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const targetPath = focusedPath ?? hoveredPath ?? activePath;

  const navRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  const [indicator, setIndicator] = useState<{
    top: number;
    height: number;
  } | null>(null);

  // The measurement and state update happen in the same commit; the user only ever sees the correctly-positioned indicator
  useLayoutEffect(() => {
    const container = navRef.current;
    const target = targetPath ? linkRefs.current.get(targetPath) : null;
    if (!container || !target) {
      setIndicator(null);

      return;
    }

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const next = {
        top: targetRect.top - containerRect.top,
        height: targetRect.height,
      };

      setIndicator((current) =>
        current?.top === next.top && current.height === next.height
          ? current
          : next,
      );
    };

    measure();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);

    observer?.observe(container);
    observer?.observe(target);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [targetPath]);

  const registerLink = (path: string, element: HTMLAnchorElement | null) => {
    if (element) linkRefs.current.set(path, element);
    else linkRefs.current.delete(path);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-base-950/85 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* `invisible` while closed keeps the off-canvas links out of the tab order on mobile; `md:visible` restores the permanently docked desktop rail. */}
      <aside
        ref={drawerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Navegación principal"
        className={`fixed top-0 left-0 z-50 stack-0 h-dvh w-64 border-r border-base-700 bg-surface-950 py-6 transition-transform duration-200 md:visible md:z-40 md:translate-x-0 ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-start gap-2 pr-4 pl-6">
          <div className="min-w-0 flex-1">
            <NavLink
              to="/"
              onClick={onClose}
              className="transition-opacity focus-visible:outline-none hocus:opacity-80"
            >
              <Wordmark />
            </NavLink>
            <p className="ml-9 font-mono text-data-label text-text-200">
              Mercado argentino
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-text-200 transition-colors focus-visible:outline-none md:hidden hocus:text-text-100"
            aria-label="Cerrar navegación"
          >
            <MdOutlineClose className="text-lg" aria-hidden="true" />
          </button>
        </div>

        <div
          ref={navRef}
          className="relative"
          onPointerLeave={() => setHoveredPath(null)}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setFocusedPath(null);
          }}
        >
          <div
            className="pointer-events-none absolute top-0 bottom-0 left-4 w-px bg-base-700/60"
            aria-hidden="true"
          />
          <div
            className={`pointer-events-none absolute left-3 z-20 h-6 w-1.5 rounded-full bg-primary-500 duration-250 ease-out motion-safe:transition-[transform,opacity] ${indicator ? "opacity-100" : "opacity-0"}`}
            style={{
              transform: `translateY(${indicator ? indicator.top + (indicator.height - 24) / 2 : 0}px)`,
            }}
            aria-hidden="true"
          />

          <nav className="flex flex-col gap-1" aria-label="Secciones">
            {nav.map((item) => (
              <SidebarItem
                key={item.label}
                item={item}
                onNavigate={onClose}
                targeted={targetPath === item.to}
                onHover={setHoveredPath}
                onFocus={setFocusedPath}
                registerLink={registerLink}
              />
            ))}
          </nav>
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-base-700 pt-6">
          {secondaryNav(onSupport).map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              onNavigate={onClose}
              compact
            />
          ))}
        </div>
      </aside>
    </>
  );
};

const SidebarItem = ({
  item,
  onNavigate,
  compact = false,
  targeted = false,
  onHover,
  onFocus,
  registerLink,
}: {
  item: NavItem;
  onNavigate: () => void;
  compact?: boolean;
  targeted?: boolean;
  onHover?: (path: string | null) => void;
  onFocus?: (path: string | null) => void;
  registerLink?: (path: string, element: HTMLAnchorElement | null) => void;
}) => {
  const {
    label,
    icon: Icon,
    to,
    onSelect,
    hoverIcon: HoverIcon,
    iconClassName,
    hoverIconClassName,
  } = item;

  const height = compact ? "h-9" : "h-11";
  const iconSize = compact ? "text-base" : "text-lg";

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          onSelect();
        }}
        onPointerEnter={() => onHover?.(null)}
        aria-haspopup="dialog"
        className={`${itemBase} ${height} ${itemIdle} ${compact ? "hover:bg-surface-900/80 focus-visible:bg-surface-900/80 focus-visible:text-primary-text-100" : ""} group w-full text-left`}
      >
        {HoverIcon ? (
          <span
            className={`relative inline-flex shrink-0 items-center justify-center ${iconSize}`}
            aria-hidden="true"
          >
            <Icon
              className={`${iconSize} ${iconClassName ?? ""} transition-opacity duration-200 group-hover:opacity-0`}
            />
            <HoverIcon
              className={`${iconSize} ${hoverIconClassName ?? ""} absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
            />
          </span>
        ) : (
          <Icon className={iconSize} aria-hidden="true" />
        )}
        {label}
      </button>
    );
  }

  if (!to) {
    return (
      <span
        className={`${itemBase} ${height} ${itemDisabled}`}
        aria-disabled="true"
        title="Próximamente"
        onPointerEnter={() => onHover?.(null)}
      >
        <Icon className={iconSize} aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <NavLink
      ref={registerLink ? (element) => registerLink(to, element) : undefined}
      to={to}
      onClick={onNavigate}
      onFocus={
        onFocus
          ? (event) =>
              onFocus(event.currentTarget.matches(":focus-visible") ? to : null)
          : undefined
      }
      onPointerDown={onFocus ? () => onFocus(null) : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          onFocus?.(null);
          onHover?.(to);
        }
      }}
      className={({ isActive }) =>
        `${itemBase} ${height} ${isActive ? itemActive : itemIdle} ${targeted ? itemTarget : ""} ${compact ? "hover:bg-surface-900/80 focus-visible:bg-surface-900/80 focus-visible:text-primary-text-100" : ""}`
      }
    >
      <Icon className={iconSize} aria-hidden="true" />
      {label}
    </NavLink>
  );
};

export { Sidebar };
