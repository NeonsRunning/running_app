import type { SVGProps } from "react";

/**
 * A small hand-rolled icon set. Line icons on `currentColor` at a 24px grid,
 * so they inherit type colour and stay crisp at any size — and the app ships
 * no icon dependency.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </Icon>
  );
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5 4.2 12.9a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5Z" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Icon>
  );
}

/* ---- "What's included" icons ------------------------------------------ */

/** Race bib: a numbered rectangle with the four pin holes. */
export function BibIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M7 8.5h.01M17 8.5h.01M7 15.5h.01M17 15.5h.01" />
      <path d="M9.5 15V9m0 0h3a1.5 1.5 0 0 1 0 3h-3" />
    </Icon>
  );
}

/** Timing chip: a tag with a circuit trace. */
export function ChipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <path d="M8 11h3v2h5" />
      <circle cx="8" cy="11" r="0.5" fill="currentColor" />
    </Icon>
  );
}

/** Finisher medal. */
export function MedalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 3 2.5 5M16 3l-2.5 5" />
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="m12 11.5 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 13.8l2-.3Z" />
    </Icon>
  );
}

/** Technical event shirt. */
export function ShirtIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 4 4 6.5 6 10l2-1v11h8V9l2 1 2-3.5L15.5 4" />
      <path d="M8.5 4a3.5 3.5 0 0 0 7 0" />
    </Icon>
  );
}

/** Hydration station cup. */
export function HydrationIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6h12l-1.4 13.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8Z" />
      <path d="M6.6 11h10.8" />
    </Icon>
  );
}

/** Race photography. */
export function PhotoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  );
}

/** Runner profile. */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

/** Account settings. */
export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </Icon>
  );
}

/** Organizer dashboard. */
export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4h7v7H4ZM13 4h7v4h-7ZM13 10h7v10h-7ZM4 13h7v7H4Z" />
    </Icon>
  );
}

/** Sign out of the account. */
export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8.5" />
      <path d="M18.5 12H10M15.5 8.5 19 12l-3.5 3.5" />
    </Icon>
  );
}
