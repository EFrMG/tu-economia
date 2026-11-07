import type { ReactNode } from "react";

interface RouteFooterProps {
  children: ReactNode;
  className?: string;
}

/** Centered source notice that closes a data route and keeps attribution in one place. */
const RouteFooter = ({ children, className = "" }: RouteFooterProps) => (
  <footer
    className={`border-t border-base-700 pt-4 text-center text-body-sm text-text-400 ${className}`}
  >
    <div className="mx-auto stack-2 max-w-3xl items-center">{children}</div>
  </footer>
);

export { RouteFooter };
