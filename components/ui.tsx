"use client";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cn = clsx;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        variant === "primary" && "bg-brand text-brand-ink hover:bg-brand/90 shadow-sm",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-raised",
        variant === "ghost" && "text-soft hover:bg-raised hover:text-ink",
        variant === "danger" && "border border-line bg-surface text-bad hover:bg-bad-wash",
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-card", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "brand" | "warn" | "ask" | "good" | "bad"; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4",
        tone === "neutral" && "bg-raised text-soft border border-line",
        tone === "brand" && "bg-brand-wash text-brand",
        tone === "warn" && "bg-warn-wash text-warn",
        tone === "ask" && "bg-ask-wash text-ask",
        tone === "good" && "bg-good-wash text-good",
        tone === "bad" && "bg-bad-wash text-bad",
        className
      )}
    >
      {children}
    </span>
  );
}

const AVATAR_TONES = ["bg-[#E7E1F7] text-[#5B3FB0]", "bg-[#DCEFE8] text-[#0C6B58]", "bg-[#FBE7D4] text-[#9A4A0B]", "bg-[#DDE8F7] text-[#2C5AA0]", "bg-[#F6DDE3] text-[#A1304E]", "bg-[#E9EBD8] text-[#5C6420]"];

export function Avatar({ name, size = 24 }: { name?: string | null; size?: number }) {
  if (!name) {
    return <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-faint text-[10px] text-faint">?</span>;
  }
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", tone)} title={name}>
      {initials}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-raised text-faint">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-soft">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-soft">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-brand/60";
