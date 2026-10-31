export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand" />
        <path d="M9 16.5l4.5 4.5L23 11.5" className="stroke-brand-ink" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">Follow-through</span>
    </span>
  );
}
