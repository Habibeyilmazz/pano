"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import type { Result } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";

/** Next renders 404 pages on the client, where the inline theme script in the root layout never runs; resolve "system" here as well. */
export function ThemeFallback() {
  useEffect(() => {
    const d = document.documentElement;
    if (d.dataset.theme === "system") d.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);
  return null;
}

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lift ${
              t.tone === "error" ? "bg-danger text-white dark:text-[#2a0d0b]" : "bg-ink text-bg"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Runs a server action, shows its error as a toast, and returns the result. */
export function useRun() {
  const toast = useToast();
  const { m } = useI18n();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(p: () => Promise<Result<T>>, okText?: string) =>
      new Promise<Result<T> | null>((resolve) =>
        start(async () => {
          try {
            const r = await p();
            if (!r.ok) toast(m.errors[r.error] ?? m.errors.generic, "error");
            else if (okText) toast(okText);
            resolve(r);
          } catch {
            toast(m.errors.generic, "error");
            resolve(null);
          }
        }),
      ),
    [toast, m],
  );
  return { run, pending };
}

/** Native modal dialog: focus trapping, Esc and an inert background for free. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-line bg-surface p-0 text-ink shadow-lift`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            <CloseButton onClick={onClose} />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function CloseButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { m } = useI18n();
  return (
    <button type="button" onClick={onClick} className="btn btn-ghost btn-sm -mr-1 -mt-1 px-1.5" aria-label={label ?? m.common.close}>
      <X size={18} aria-hidden />
    </button>
  );
}

export function CopyField({ value }: { value: string }) {
  const { m } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input font-mono text-xs" readOnly value={value} onFocus={(e) => e.target.select()} aria-label="URL" />
      <button
        type="button"
        className="btn btn-primary shrink-0"
        onClick={async () => {
          await navigator.clipboard?.writeText(value).catch(() => {});
          setDone(true);
        }}
      >
        {done ? m.common.copied : m.common.copy}
      </button>
    </div>
  );
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}
