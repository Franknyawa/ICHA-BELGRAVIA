export default function GoldRule({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      <span className="h-px flex-1 bg-brass/40" />
      <span className="h-1.5 w-1.5 rotate-45 bg-brass" />
      <span className="h-px flex-1 bg-brass/40" />
    </div>
  );
}
