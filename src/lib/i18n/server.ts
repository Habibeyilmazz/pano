import "server-only";
import { cookies } from "next/headers";
import { getCtx, LOCALE_COOKIE } from "../session";
import { isLocale, makeI18n, type Locale } from ".";

export async function getLocale(): Promise<Locale> {
  const ctx = await getCtx();
  if (ctx) return ctx.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "tr";
}

export async function getI18n() {
  return makeI18n(await getLocale());
}
