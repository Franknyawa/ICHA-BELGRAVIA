export default function CoupeIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Bord de la coupe */}
      <path d="M28 56c0 0 42-16 82-16s82 16 82 16" />
      {/* Galbe de la coupe */}
      <path d="M28 56c6 52 42 94 82 94s76-42 82-94" />
      {/* Niveau du liquide */}
      <path d="M45 76c0 0 30 17 65 17s65-17 65-17" opacity="0.45" />
      {/* Pied */}
      <line x1="110" y1="150" x2="110" y2="235" />
      <path d="M66 241c0 0 25 8 44 8s44-8 44-8" />
      {/* Zeste / garniture */}
      <path d="M150 46c10-10 25-7 28 5 3 12-10 18-18 12" />
      {/* Bulles */}
      <circle cx="128" cy="20" r="2.6" />
      <circle cx="146" cy="9" r="2" />
      <circle cx="113" cy="6" r="2" />
    </svg>
  );
}
