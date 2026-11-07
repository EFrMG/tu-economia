import * as React from "react";
import { Link } from "react-router";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `danger` is reserved for irreversible actions, such as deleting the account. */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  href?: string;
  isExternal?: boolean;
  /** Forwarded to the underlying anchor when `href` is set. */
  download?: boolean | string;
  target?: string;
}

const baseStyles =
  "inline-flex items-center justify-center rounded-none font-mono font-medium tracking-tight uppercase transition-all focus-visible:outline-none btn-click-soft disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-primary-500 text-base-950 hocus:bg-primary-400",
  secondary:
    "bg-surface-900 text-text-100 border border-base-700 hocus:bg-overlay-950",
  outline:
    "bg-transparent border border-primary-500/50 text-primary-text-100 hocus:bg-surface-900/80",
  ghost:
    "bg-transparent text-text-300 hocus:text-text-100 hocus:bg-surface-900/80",
  // The border matches the fill so it sizes like the bordered variants beside it.
  danger:
    "border border-red-500 bg-red-500 text-red-text-100 hocus:border-red-400 hocus:bg-red-400",
} as const;

const sizes = {
  sm: "px-3 py-1 text-xs",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-4 text-base",
} as const;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      href,
      isExternal,
      children,
      ...props
    },
    ref,
  ) => {
    const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    if (href) {
      // `mailto:` links belong to the browser's mail client, so they need a native anchor without a new tab or router navigation.
      if (isExternal || href.startsWith("mailto:")) {
        return (
          <a
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={combinedClassName}
            {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
          >
            {children}
          </a>
        );
      }

      return (
        <Link
          to={href}
          className={combinedClassName}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {children}
        </Link>
      );
    }

    return (
      <button ref={ref} className={combinedClassName} {...props}>
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button };
