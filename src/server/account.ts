import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s, type Tx } from "@/db";
import { fail } from "@/lib/errors";
import { BUILTIN_ROLES, type BuiltinRole } from "@/lib/perms";
import type { Ctx } from "./ctx";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, o: object) => Promise<Buffer>;
const LOG_N = Number(process.env.SCRYPT_LOG_N ?? 17); // OWASP: N=2^17, r=8, p=1

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 2 ** LOG_N;
  const key = await scryptAsync(pw, salt, 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  return `scrypt$${LOG_N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  // Burn the same time for unknown users so response time does not reveal accounts.
  const [, logN, salt, key] = (stored ?? `scrypt$${LOG_N}$AAAAAAAAAAAAAAAAAAAAAA==$`).split("$");
  const N = 2 ** Number(logN);
  const got = await scryptAsync(pw, Buffer.from(salt, "base64"), 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  const want = Buffer.from(key, "base64");
  return !!stored && want.length === got.length && timingSafeEqual(got, want);
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export const passwordSchema = z
  .string()
  .min(10)
  .max(200)
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), "weak");

export const emailSchema = z.string().trim().toLowerCase().email().max(200);
export const nameSchema = z.string().trim().min(1).max(100);
export const localeSchema = z.enum(["tr", "en"]);

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const weak = r.error.issues.some((i) => i.path.includes("password") || i.message === "weak");
    fail(weak ? "weak_password" : "invalid");
  }
  return r.data as z.infer<T>;
}
export { parse };

const SESSION_DAYS = 14;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function createSession(userId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, userId), lt(s.sessions.expiresAt, new Date())));
  await db.insert(s.sessions).values({ id: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userIdForSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ userId: s.sessions.userId })
    .from(s.sessions)
    .where(and(eq(s.sessions.id, sha256(token)), gt(s.sessions.expiresAt, new Date())));
  return row?.userId ?? null;
}

export async function deleteSession(token: string) {
  const db = await getDb();
  await db.delete(s.sessions).where(eq(s.sessions.id, sha256(token)));
}

export async function deleteUserSessions(userId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  await db.delete(s.sessions).where(eq(s.sessions.userId, userId));
}

/** Creates the four built-in roles for a new workspace. Names are stored per language at render time. */
export async function createBuiltinRoles(tx: Tx, workspaceId: string) {
  const rows = await tx
    .insert(s.roles)
    .values(
      (Object.keys(BUILTIN_ROLES) as BuiltinRole[]).map((b) => ({
        workspaceId,
        name: b,
        builtin: b,
        permissions: [...BUILTIN_ROLES[b]],
      })),
    )
    .returning();
  return Object.fromEntries(rows.map((r) => [r.builtin!, r.id])) as Record<BuiltinRole, string>;
}

const signupSchema = z.object({
  company: z.string().trim().min(2).max(100),
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema,
});

export async function signupCompany(input: unknown) {
  const data = parse(signupSchema, input);
  return transaction(async (tx) => {
    const [taken] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, data.email));
    if (taken) fail("email_taken");
    const [w] = await tx.insert(s.workspaces).values({ name: data.company }).returning();
    const roleIds = await createBuiltinRoles(tx, w.id);
    const [u] = await tx
      .insert(s.users)
      .values({
        workspaceId: w.id,
        roleId: roleIds.admin,
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        locale: data.locale,
      })
      .returning();
    return { userId: u.id, workspaceId: w.id, ...(await createSession(u.id, tx)) };
  });
}

const ipHits = new Map<string, number[]>();
// shortcut: per-process memory, fine for one app instance; move to the DB or Redis when scaling out.
function ipLimited(ip: string) {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 15 * 60e3);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > 30;
}

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export async function login(input: unknown, ip = "local") {
  const data = parse(loginSchema, input);
  if (ipLimited(ip)) fail("locked");
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, data.email));
  if (u?.lockedUntil && u.lockedUntil > new Date()) fail("locked");
  const ok = await verifyPassword(data.password, u?.active ? u.passwordHash : null);
  if (!u || !ok) {
    if (u) {
      const failed = u.failedLogins + 1;
      await db
        .update(s.users)
        .set({
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60e3) : null,
        })
        .where(eq(s.users.id, u.id));
      if (failed >= MAX_FAILED) fail("locked");
    }
    fail("bad_credentials");
  }
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, u!.id));
  return { userId: u!.id, locale: u!.locale, ...(await createSession(u!.id)) };
}

/** Invite links double as password-reset links. Returns the user the token belongs to, if valid. */
export async function inviteUser(token: string) {
  const db = await getDb();
  const [u] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, locale: s.users.locale, ws: s.workspaces.name })
    .from(s.users)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.users.workspaceId))
    .where(
      and(
        eq(s.users.inviteTokenHash, sha256(token)),
        gt(s.users.inviteExpiresAt, new Date()),
        eq(s.users.active, true),
      ),
    );
  return u ?? null;
}

export async function acceptInvite(input: unknown) {
  const data = parse(z.object({ token: z.string().min(10).max(100), password: passwordSchema }), input);
  const u = (await inviteUser(data.token)) ?? fail("invite_invalid");
  const db = await getDb();
  await db
    .update(s.users)
    .set({
      passwordHash: await hashPassword(data.password),
      inviteTokenHash: null,
      inviteExpiresAt: null,
      mustChangePassword: false,
      failedLogins: 0,
      lockedUntil: null,
    })
    .where(eq(s.users.id, u.id));
  await deleteUserSessions(u.id);
  return { userId: u.id, locale: u.locale, ...(await createSession(u.id)) };
}

export async function changePassword(ctx: Ctx, input: unknown) {
  const data = parse(z.object({ current: z.string().max(200), password: passwordSchema }), input);
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.id, ctx.userId));
  if (!(await verifyPassword(data.current, u.passwordHash))) fail("bad_credentials");
  if (data.current === data.password) fail("weak_password");
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(data.password), mustChangePassword: false })
    .where(eq(s.users.id, ctx.userId));
  // Sign out every other device.
  await deleteUserSessions(ctx.userId);
  return createSession(ctx.userId);
}

const profileSchema = z.object({
  name: nameSchema.optional(),
  locale: localeSchema.optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
});

export async function updateProfile(ctx: Ctx, input: unknown) {
  const data = parse(profileSchema, input);
  const db = await getDb();
  await db.update(s.users).set(data).where(eq(s.users.id, ctx.userId));
}
