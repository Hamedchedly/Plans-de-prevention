import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50'
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    ghost: 'border border-border bg-background hover:bg-muted',
    danger: 'bg-destructive text-destructive-foreground hover:opacity-90',
  }[variant]
  return <button className={`${base} ${styles} ${className}`} {...p} />
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'off' }) {
  const styles = {
    default: 'bg-muted text-foreground',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    off: 'bg-slate-200 text-slate-700',
  }[tone]
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const styles = {
    info: 'border-border bg-muted',
    error: 'border-red-300 bg-red-50 text-red-800',
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  }[tone]
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>{children}</div>
}

export const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
}
