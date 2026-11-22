import { devices, expect, test, type Page } from "playwright/test";

const stamp = Date.now().toString(36);
const adminEmail = `admin-${stamp}@e2e.test`;
const memberEmail = `uye-${stamp}@e2e.test`;
const PW = "E2eParola2026";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

test.describe.configure({ mode: "serial" });

test("company sign-up, team setup, board work and the people views", async ({ page, browser }) => {
  // The app must run under its Content-Security-Policy without a single violation.
  const cspErrors: string[] = [];
  page.on("console", (m) => m.text().includes("Content Security Policy") && cspErrors.push(m.text()));
  let dialogs = 0;
  page.on("dialog", (d) => void (dialogs++, d.dismiss()));

  // 1. A company signs up; its first user is the admin.
  const res = await page.goto("/signup");
  expect(res!.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await page.getByLabel("Şirket adı").fill("Deneme Teknoloji A.Ş.");
  await page.getByLabel("Adınız soyadınız").fill("Gül Işık");
  await page.getByLabel("E-posta").fill(adminEmail);
  await page.getByLabel("Parola", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page.getByRole("heading", { name: "İşlerim" })).toBeVisible();

  // 2. A custom role with ticked permissions.
  await page.getByRole("link", { name: "Roller" }).first().click();
  await page.getByRole("button", { name: "Yeni rol" }).click();
  await page.getByLabel("Rol adı").fill("Geliştirici");
  for (const p of ["Görev oluşturma", "Kendine atama", "Başkalarına atama", "Yorum yazma"]) await page.getByLabel(p).check();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Geliştirici" })).toBeVisible();

  // 3. The admin adds a colleague with a temporary password.
  await page.getByRole("link", { name: "Kullanıcılar" }).click();
  await page.getByRole("button", { name: "Kullanıcı ekle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad soyad").fill("Şükrü Çağlar");
  await dialog.getByLabel("E-posta").fill(memberEmail);
  await dialog.getByLabel("Rol", { exact: true }).selectOption({ label: "Geliştirici" });
  await dialog.getByText("Geçici parola belirle").click();
  await dialog.getByLabel("Parola", { exact: true }).fill("GeciciParola1");
  await dialog.getByRole("button", { name: "Kullanıcıyı oluştur" }).click();
  await expect(page.getByRole("cell", { name: /Şükrü Çağlar/ })).toBeVisible();
  // 3b. An invite link for an English-speaking viewer opens in English; she sets her password and is in.
  await page.getByRole("button", { name: "Kullanıcı ekle" }).click();
  await dialog.getByLabel("Ad soyad").fill("Iris Brown");
  await dialog.getByLabel("E-posta").fill(`iris-${stamp}@e2e.test`);
  await dialog.getByLabel("Rol", { exact: true }).selectOption({ label: "İzleyici" });
  await dialog.getByLabel("Dil").selectOption("en");
  await dialog.getByRole("button", { name: "Kullanıcıyı oluştur" }).click();
  const inviteUrl = await page.getByRole("textbox", { name: "URL" }).inputValue();
  await page.keyboard.press("Escape");
  const ctxInvite = await browser.newContext();
  const pInvite = await ctxInvite.newPage();
  await pInvite.goto(inviteUrl);
  await expect(pInvite.getByRole("heading", { name: "Join Deneme Teknoloji A.Ş. on pano" })).toBeVisible();
  await pInvite.getByLabel("New password").fill("IrisParola2026");
  await pInvite.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(pInvite.getByRole("heading", { name: "My work" })).toBeVisible();
  // The link works once.
  const reuse = await browser.newPage();
  await reuse.goto(inviteUrl);
  await expect(reuse.getByRole("link", { name: /Giriş sayfasına git|Go to sign in/ })).toBeVisible();
  await reuse.close();

  await page.getByRole("link", { name: "Denetim kaydı" }).click();
  await expect(page.getByText("Kullanıcı ekledi: Şükrü Çağlar (Geliştirici)")).toBeVisible();

  // 4. A project with the default columns, and a task.
  await page.getByRole("link", { name: "Projeler" }).first().click();
  await page.getByRole("button", { name: "Yeni proje" }).click();
  await page.getByLabel("Anahtar", { exact: true }).fill("API");
  await page.getByLabel("Proje adı").fill("Ödeme Servisi");
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect(page.getByRole("heading", { name: /Ödeme Servisi/ })).toBeVisible();
  for (const col of ["Yapılacak", "Devam ediyor", "İncelemede", "Tamamlandı"]) await expect(page.getByRole("region", { name: col })).toBeVisible();

  await page.keyboard.press("c");
  await page.getByLabel("Başlık").fill("İade akışını yaz");
  await page.getByRole("button", { name: "Görevi oluştur" }).click();
  const todo = page.getByRole("region", { name: "Yapılacak" });
  await expect(todo.getByText("İade akışını yaz")).toBeVisible();

  // 5. Drag the card to "Devam ediyor" with the mouse; the move survives a reload.
  const card = todo.getByRole("listitem").filter({ hasText: "İade akışını yaz" });
  const target = page.getByRole("region", { name: "Devam ediyor" });
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(target.getByText("İade akışını yaz")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Devam ediyor" }).getByText("İade akışını yaz")).toBeVisible();

  // 5b. Keyboard alternative: focus the handle, Space to lift, arrow right, Space to drop.
  await page.getByRole("button", { name: /görevini taşı$/ }).first().focus();
  // Pauses like a person's: the sensor starts listening for arrows just after the lift.
  for (const key of ["Space", "ArrowRight", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }
  await expect(page.getByRole("region", { name: "İncelemede" }).getByText("İade akışını yaz")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "İncelemede" }).getByText("İade akışını yaz")).toBeVisible();

  // 5c. The viewer sees the board but cannot change it: no new-task button, no drag handles,
  //     no editing in the task panel, and "c" does nothing.
  await pInvite.goto("/projects/API", { waitUntil: "networkidle" });
  await expect(pInvite.getByRole("region", { name: "In review" }).getByText("İade akışını yaz")).toBeVisible();
  await expect(pInvite.getByRole("button", { name: "New task" })).toHaveCount(0);
  await expect(pInvite.getByRole("button", { name: /^Move / })).toHaveCount(0);
  await pInvite.keyboard.press("c");
  await expect(pInvite.getByLabel("Title")).toHaveCount(0);
  await pInvite.getByRole("link", { name: "İade akışını yaz" }).click();
  await expect(pInvite.getByRole("dialog").getByRole("heading", { name: "İade akışını yaz" })).toBeVisible();
  await expect(pInvite.getByRole("dialog").getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(pInvite.getByRole("dialog").getByRole("button", { name: "Assign to me" })).toHaveCount(0);
  await ctxInvite.close();

  // 6. Open the task, assign the colleague, comment with a mention.
  await page.getByRole("link", { name: "İade akışını yaz" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Kişi ata").selectOption({ label: "Şükrü Çağlar" });
  await expect(panel.getByRole("link", { name: "Şükrü Çağlar" })).toBeVisible();
  await panel.getByLabel(/Yorum yazın/).fill(`@${memberEmail.split("@")[0]} bakabilir misin?`);
  await panel.getByRole("button", { name: "Yorumu gönder" }).click();
  await expect(panel.getByRole("link", { name: "@Şükrü Çağlar" })).toBeVisible();

  // 6b. Comments are Markdown without raw HTML or script URLs; //host links open as external.
  await panel.getByLabel(/Yorum yazın/).fill(`<img src="x" onerror="alert(1)"> [tıkla](javascript:alert(2)) [dış](//example.test)`);
  await panel.getByRole("button", { name: "Yorumu gönder" }).click();
  await expect(panel.getByRole("link", { name: "dış" })).toHaveAttribute("target", "_blank");
  await expect(panel.getByRole("link", { name: "tıkla" })).not.toHaveAttribute("href", /javascript/i);
  await expect(panel.locator('img[src="x"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 7. Team view shows what the colleague is doing now.
  await page.getByRole("link", { name: "Ekip" }).first().click();
  const row = page.getByRole("listitem").filter({ hasText: "Şükrü Çağlar" });
  await expect(row.getByText("İade akışını yaz")).toBeVisible();

  // 7b. A WIP limit turns the column amber; on a phone the board scrolls inside itself and the page
  // stays as wide as the screen (an escaping screen-reader label once zoomed the whole page out).
  await page.goto("/projects/API", { waitUntil: "networkidle" }); // "c" needs the hydrated board
  for (const title of ["Fatura şablonu", "Kur farkı raporu"]) {
    await page.keyboard.press("c");
    await page.getByLabel("Başlık").fill(title);
    await page.getByLabel("Sütun").selectOption({ label: "Devam ediyor" });
    await page.getByRole("button", { name: "Görevi oluştur" }).click();
    await expect(target.getByText(title)).toBeVisible();
  }
  await page.goto("/projects/API/settings");
  const wipRow = page.locator("li", { has: page.getByLabel("İş sınırı") }).nth(1);
  await wipRow.getByLabel("İş sınırı").fill("1");
  await wipRow.getByRole("button", { name: "Kaydet" }).click();
  await expect(wipRow.getByLabel("İş sınırı")).toHaveValue("1");
  const phone = await browser.newContext({ ...devices["Pixel 7"], storageState: await page.context().storageState() });
  const pPhone = await phone.newPage();
  await pPhone.goto("/projects/API");
  await expect(pPhone.getByRole("region", { name: "Devam ediyor" }).getByTitle("İş sınırı aşıldı: 2/1")).toBeVisible();
  expect(await pPhone.evaluate(() => [innerWidth, document.documentElement.scrollWidth])).toEqual([412, 412]);
  await phone.close();
  expect(cspErrors).toEqual([]);
  expect(dialogs).toBe(0);

  // 8. The colleague signs in, must change the temporary password, and sees the work in My work.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await signIn(p2, memberEmail, "GeciciParola1");
  await expect(p2.getByRole("heading", { name: "Parolanızı değiştirin" })).toBeVisible();
  await p2.getByLabel("Mevcut parola").fill("GeciciParola1");
  await p2.getByLabel("Yeni parola").fill("KendiParolam9");
  await p2.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(p2.getByRole("heading", { name: "İşlerim" })).toBeVisible();
  await expect(p2.getByRole("region", { name: "Devam ediyor" }).getByText("İade akışını yaz")).toBeVisible();
  await expect(p2.getByText("İncelemede")).toBeVisible();
  await p2.getByRole("link", { name: /Bildirimler/ }).click();
  await expect(p2.getByText(/görevinde sizden bahsetti/)).toBeVisible();

  // 9. Members cannot reach admin pages; the server answers 404.
  await p2.goto("/admin/users");
  await expect(p2.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();

  // 10. English works end to end.
  await p2.goto("/settings");
  await p2.getByLabel("Arayüz dili").selectOption("en");
  await p2.getByRole("button", { name: "Kaydet" }).click();
  await expect(p2.getByRole("heading", { name: "My settings" })).toBeVisible();
  await p2.getByRole("link", { name: "My work" }).first().click();
  await expect(p2.getByRole("heading", { name: "My work" })).toBeVisible();
  await ctx2.close();
});

test("another company cannot see the first company's board", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/signup");
  await page.getByLabel("Şirket adı").fill("Rakip Ltd.");
  await page.getByLabel("Adınız soyadınız").fill("Rakip Yönetici");
  await page.getByLabel("E-posta").fill(`rakip-${stamp}@e2e.test`);
  await page.getByLabel("Parola", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page.getByRole("heading", { name: "İşlerim" })).toBeVisible();
  for (const url of ["/projects/API", "/projects/API?task=API-1", "/projects/API/settings"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
    // A dark-mode user's 404 page is dark too (the inline theme script does not run there).
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  const res = await page.request.get("/projects/API/export");
  expect(res.status()).toBe(404);
  await page.goto("/search?q=iade");
  await expect(page.getByText("İade akışını yaz")).toHaveCount(0);
  await ctx.close();
});

test("anonymous visitors reach only the sign-in pages", async ({ page, browser }) => {
  for (const url of ["/my-work", "/projects/API", "/admin/users", "/team"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect((await page.request.get("/projects/API/export")).status()).toBe(401);
  await page.goto("/invite/not-a-real-token-123");
  await expect(page.getByRole("link", { name: "Giriş sayfasına git" })).toBeVisible();

  // Submitted before the JavaScript loads, the sign-in form posts: the password never lands in the URL.
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p = await noJs.newPage();
  await p.goto("/login");
  await p.getByLabel("E-posta").fill(adminEmail);
  await p.getByLabel("Parola", { exact: true }).fill(PW);
  await Promise.all([p.waitForNavigation(), p.getByRole("button", { name: "Giriş yap" }).click()]);
  expect(p.url()).not.toContain("password");
  await noJs.close();
});
