/**
 * Captures every screen of a running, seeded app (default http://localhost:4500).
 * Usage: npx tsx scripts/screenshots.ts [outDir] [baseUrl]
 */
import { chromium, type Page } from "playwright";

const out = process.argv[2] ?? "docs/screenshots";
const base = process.argv[3] ?? "http://localhost:4500";
const PASSWORD = "PanoDemo2026";

async function login(page: Page, email: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel(/E-posta|Email/).fill(email);
  await page.getByLabel(/^(Parola|Password)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /Giriş yap|Sign in/ }).click();
  await page.waitForURL(/my-work/);
}

async function shot(page: Page, name: string, path: string, after?: (p: Page) => Promise<void>) {
  await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle");
  if (after) await after(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
}

async function main() {
  const browser = await chromium.launch();
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const page = await desk.newPage();
  await shot(page, "login", "/login");
  await shot(page, "signup", "/signup");
  await login(page, "ayse@ornek.test");
  await shot(page, "my-work", "/my-work");
  await shot(page, "board", "/projects/WEB");
  await shot(page, "task", "/projects/WEB?task=WEB-1");
  await shot(page, "list", "/projects/WEB/list");
  await shot(page, "backlog", "/projects/WEB/backlog");
  await shot(page, "team", "/team");
  const team = await page.locator("a[href^='/team/']").first().getAttribute("href");
  await shot(page, "person", team!);
  await shot(page, "dashboard", "/dashboard");
  await shot(page, "projects", "/projects");
  await shot(page, "project-settings", "/projects/WEB/settings");
  await shot(page, "users", "/admin/users");
  await shot(page, "roles", "/admin/roles");
  await shot(page, "audit", "/admin/audit");
  await shot(page, "settings", "/settings");
  await shot(page, "notifications", "/notifications");
  await shot(page, "search", "/search?q=istanbul");
  await shot(page, "new-task", "/projects/WEB?new=1");
  await shot(page, "shortcuts", "/my-work", async (p) => {
    await p.keyboard.press("?");
  });

  // Selin is a read-only viewer who uses the app in English, on a dark system theme.
  const selin = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", locale: "en-GB" });
  const sp = await selin.newPage();
  await login(sp, "selin@ornek.test");
  await shot(sp, "board-dark-en", "/projects/MOB");
  await shot(sp, "team-dark-en", "/team");
  await shot(sp, "task-dark-en", "/projects/MOB?task=MOB-3");
  await shot(sp, "backlog-dark-en", "/projects/WEB/backlog");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "tr-TR" });
  const pp = await phone.newPage();
  await login(pp, "emre@ornek.test");
  await shot(pp, "mobile-my-work", "/my-work");
  await shot(pp, "mobile-board", "/projects/MOB");
  await shot(pp, "mobile-task", "/projects/MOB?task=MOB-3");
  await shot(pp, "mobile-team", "/team");
  await shot(pp, "mobile-backlog", "/projects/WEB/backlog");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
