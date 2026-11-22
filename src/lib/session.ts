import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { userIdForSession } from "@/server/account";
import { loadCtx, type Ctx, type Locale } from "@/server/ctx";

export const SESSION_COOKIE = "pano_session";
export const LOCALE_COOKIE = "pano_locale";

const secure = process.env.COOKIE_SECURE !== "false";

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires });
}

export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, { secure, sameSite: "lax", path: "/", maxAge: 365 * 864e2 });
}

/** The signed-in user's context for this request, or null. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await userIdForSession(token);
  return userId ? loadCtx(userId) : null;
});

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}
