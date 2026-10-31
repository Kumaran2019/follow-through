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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" && "h-8 px-3.5 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "primary" && "bg-brand text-brand-ink font-semibold hover:bg-brand/85",
        variant === "secondary" && "border border-[#2A2A2D] bg-transparent text-ink hover:bg-raised",
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
  return <div className={cn("rounded-[18px] border border-line bg-surface", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "brand" | "warn" | "ask" | "good" | "bad"; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11.5px] leading-4",
        tone === "neutral" && "text-soft border border-line",
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

const AVATAR_TONES = ["bg-[#1E2A3A] text-[#8EC2FF]", "bg-[#2E2338] text-[#D3B2FF]", "bg-[#23331A] text-[#C6FF3D]", "bg-[#33241A] text-[#FFC08A]", "bg-[#3A1F2A] text-[#FF9EC0]", "bg-[#1A3330] text-[#7FE8D6]"];

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
    <div className="flex flex-col items-center justify-center rounded-[18px] border border-dashed border-[#3A3A3E] px-6 py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-raised text-faint">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-soft">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[42px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[15px] text-faint">{sub}</p>}
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

export const inputCls = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-faint focus:border-brand/60";
