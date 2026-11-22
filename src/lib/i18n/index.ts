import { APP_TZ, today } from "../dates";
import { en } from "./en";
import { tr } from "./tr";

export type Locale = "tr" | "en";
export type Messages = typeof tr;
export type Plural = { one: string; other: string };

export const LOCALES: Locale[] = ["tr", "en"];
export const catalogs: Record<Locale, Messages> = { tr, en };
export const isLocale = (v: unknown): v is Locale => v === "tr" || v === "en";

export function fmt(s: string, params: Record<string, string | number | null | undefined> = {}) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}

/** Everything locale-aware in one object, usable on the server and in client components. */
export function makeI18n(locale: Locale) {
  const tag = locale === "tr" ? "tr-TR" : "en-GB";
  const m = catalogs[locale];
  const nf = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
  const pr = new Intl.PluralRules(tag);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const num = (n: number) => nf.format(n);
  return {
    locale,
    tag,
    m,
    fmt,
    num,
    plural: (p: Plural, n: number) => fmt(pr.select(n) === "one" ? p.one : p.other, { n: num(n) }),
    /** Date-only values (YYYY-MM-DD) are shown as calendar dates, never shifted by time zones. */
    day: (ymd: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
      new Intl.DateTimeFormat(tag, { ...opts, timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`)),
    dateTime: (d: Date | string) =>
      new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: APP_TZ }).format(new Date(d)),
    ago: (d: Date | string) => {
      const sec = (new Date(d).getTime() - Date.now()) / 1000;
      const abs = Math.abs(sec);
      if (abs < 60) return rtf.format(Math.round(sec), "second");
      if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
      return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: APP_TZ }).format(new Date(d));
    },
    /** Relative due label: Overdue / Today / Tomorrow / 12 Mar. */
    due: (ymd: string, done = false) => {
      const t = today();
      if (!done && ymd < t) return { text: m.task.overdue + " · " + fmtDay(tag, ymd), tone: "late" as const };
      if (ymd === t) return { text: m.task.dueToday, tone: done ? ("plain" as const) : ("soon" as const) };
      if (ymd === today(1)) return { text: m.task.dueTomorrow, tone: done ? ("plain" as const) : ("soon" as const) };
      return { text: fmtDay(tag, ymd), tone: "plain" as const };
    },
    columnName: (c: { name: string | null; defaultKey: string | null }) =>
      c.name ?? m.columns.defaults[(c.defaultKey ?? "todo") as keyof Messages["columns"]["defaults"]] ?? "",
    roleName: (r: { name: string; builtin?: string | null; roleBuiltin?: string | null; roleName?: string }) => {
      const b = r.builtin ?? r.roleBuiltin;
      return b ? m.roles.builtin[b as keyof Messages["roles"]["builtin"]] : (r.roleName ?? r.name);
    },
  };
}

function fmtDay(tag: string, ymd: string) {
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
}

export type I18n = ReturnType<typeof makeI18n>;
