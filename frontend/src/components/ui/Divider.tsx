/** A centered Art Deco hairline rule with a small brass diamond. CSS-only. */
export default function Divider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 text-brass ${className}`}
      aria-hidden
    >
      <span className="h-px w-12 bg-brass/50" />
      <span className="text-[0.6rem]">◆</span>
      <span className="h-px w-12 bg-brass/50" />
    </div>
  );
}
