type Props = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconUser({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4" />
    </svg>
  );
}

export function IconLock({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}

export function IconStorefront({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 10V6.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1V10" />
      <path d="M3.5 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.4 3 3.1 3s3.1-1.3 3.1-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M5.5 12.8V19h13v-6.2" />
      <path d="M9.8 19v-4.2c0-.9.7-1.6 1.6-1.6h1.2c.9 0 1.6.7 1.6 1.6V19" />
    </svg>
  );
}

export function IconGlass({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M6 4h12l-1.3 6.5a4.7 4.7 0 0 1-9.4 0Z" />
      <path d="M12 11v6.5" />
      <path d="M8.3 20h7.4" />
      <path d="M12 17.5v2.5" />
    </svg>
  );
}

export function IconPhone({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M6.5 3.5h3l1.3 4.2-2 1.6a12 12 0 0 0 5.9 5.9l1.6-2 4.2 1.3v3a1.5 1.5 0 0 1-1.6 1.5C11.8 18.6 5.4 12.2 5 5.1a1.5 1.5 0 0 1 1.5-1.6Z" />
    </svg>
  );
}

export function IconPin({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 21.5c4-4.2 7-8 7-11.5a7 7 0 0 0-14 0c0 3.5 3 7.3 7 11.5Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IconCamera({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function IconClock({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconCheckCircle({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.3 12.3l2.4 2.4 5-5.4" />
    </svg>
  );
}

export function IconClipboard({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="6" y="4.5" width="12" height="16" rx="1.6" />
      <path d="M9.5 4.5V4a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 4v.5" />
      <path d="M9 10.5h6M9 14h6M9 17.5h4" />
    </svg>
  );
}

export function IconUsers({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8.3" r="3" />
      <path d="M3.3 19c1-3.1 3.2-4.6 5.7-4.6s4.7 1.5 5.7 4.6" />
      <circle cx="17" cy="9.3" r="2.3" />
      <path d="M15.3 14.6c2 .2 3.6 1.6 4.4 4.4" />
    </svg>
  );
}

export function IconList({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M9 6.5h10M9 12h10M9 17.5h10" />
      <circle cx="5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChart({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 20V4M4 20h16" />
      <path d="M7.5 17V12M12 17V8M16.5 17v-5.5M20 17V6" />
    </svg>
  );
}

export function IconDownload({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.5v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v2A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  );
}

export function IconPlus({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconLogout({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9.5" />
    </svg>
  );
}

export function IconInstall({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="4" y="4" width="16" height="11" rx="1.4" />
      <path d="M9 19.5h6" />
      <path d="M12 15v4.5" />
      <path d="M9.5 9.2 12 11.5l2.5-2.3" />
      <path d="M12 6v5.5" />
    </svg>
  );
}

export function IconTrend({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 16l5.5-5.5 3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </svg>
  );
}
