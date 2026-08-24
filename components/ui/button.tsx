import { Link } from "@/components/i18n/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";

export type ButtonSize = "sm" | "md" | "lg" | "xl";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 border-2 font-black uppercase tracking-[0.12em] transition-[background-color,color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  // The single loudest action on a screen. Neon yellow on black.
  primary:
    "border-neon-yellow bg-neon-yellow text-ink hover:bg-white hover:border-white",
  // Lime companion — used when a primary already exists nearby.
  secondary:
    "border-neon-lime bg-neon-lime text-ink hover:bg-neon-green hover:border-neon-green",
  outline:
    "border-line-strong bg-transparent text-fg hover:border-neon-lime hover:text-neon-lime",
  ghost:
    "border-transparent bg-transparent text-fg-muted hover:bg-graphite hover:text-fg",
  danger:
    "border-danger bg-transparent text-danger hover:bg-danger hover:text-ink",
  success:
    "border-neon-green bg-transparent text-neon-green hover:bg-neon-green hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-[11px]",
  md: "px-4 py-3 text-xs",
  lg: "px-6 py-4 text-sm",
  xl: "px-8 py-5 text-base",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentProps<"button">, "className" | "children"> & { href?: never };

type ButtonAsLink = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children" | "href"> & {
    href: string;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    block = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );

  if ("href" in rest && rest.href) {
    const { href, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonRest } = rest as ButtonAsButton;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}

/** Square action button for icon-only affordances. Always needs an aria-label. */
export function IconButton({
  className,
  children,
  label,
  active = false,
  ...rest
}: Omit<ComponentProps<"button">, "className" | "children"> & {
  className?: string;
  children: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 transition-colors duration-150",
        active
          ? "border-neon-yellow bg-neon-yellow/10 text-neon-yellow"
          : "border-line-strong text-fg-dim hover:border-fg-dim hover:text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
