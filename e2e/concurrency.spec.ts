import { devices, expect, test, type Page } from "playwright/test";

const stamp = Date.now().toString(36);
const CONFLICT = /başka biri tarafından değiştirildi/;

async function keyboardMove(page: Page, steps: number) {
  await page.getByRole("button", { name: /görevini taşı$/ }).first().focus();
  for (const key of ["Space", ...Array(steps).fill("ArrowRight"), "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }
}

test("two people working on the same card at once: nobody's change is lost silently", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Şirket adı").fill("Eşzamanlı Ltd.");
  await page.getByLabel("Adınız soyadınız").fill("Ilgın Öztürk");
  await page.getByLabel("E-posta").fill(`es-${stamp}@e2e.test`);
  await page.getByLabel("Parola", { exact: true }).fill("E2eParola2026");
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page.getByRole("heading", { name: "İşlerim" })).toBeVisible();
  await page.goto("/projects");
  await page.getByRole("button", { name: "Yeni proje" }).click();
  await page.getByLabel("Anahtar", { exact: true }).fill("ESZ");
  await page.getByLabel("Proje adı").fill("Eşzamanlılık");
  await page.getByRole("button", { name: "Oluştur" }).click();
  await page.goto("/projects/ESZ", { waitUntil: "networkidle" });
  await page.keyboard.press("c");
  await page.getByLabel("Başlık").fill("Ortak kart");
  await page.getByRole("button", { name: "Görevi oluştur" }).click();
  await expect(page.getByRole("region", { name: "Yapılacak" }).getByText("Ortak kart")).toBeVisible();

  // A second tab stands in for a colleague who loaded the board earlier.
  const other = await page.context().newPage();
  await other.goto("/projects/ESZ", { waitUntil: "networkidle" });

  // 1. Both move the card. The second move was made on a stale board: it is refused and the
  //    board shows where the card really is.
  await keyboardMove(page, 1);
  await expect(page.getByRole("region", { name: "Devam ediyor" }).getByText("Ortak kart")).toBeVisible();
  await keyboardMove(other, 2);
  await expect(other.getByText(CONFLICT)).toBeVisible();
  await expect(other.getByRole("region", { name: "Devam ediyor" }).getByText("Ortak kart")).toBeVisible();
  await expect(other.getByRole("region", { name: "İncelemede" }).getByText("Ortak kart")).toHaveCount(0);

  // 2. Both edit the description. The later save is refused and its text stays in the editor.
  await page.goto("/projects/ESZ?task=ESZ-1", { waitUntil: "networkidle" });
  await other.goto("/projects/ESZ?task=ESZ-1", { waitUntil: "networkidle" });
  const draft = "Uzun bir taslak: İzmir şubesi için ölçüm planı.";
  await other.getByRole("dialog").getByRole("button", { name: "Düzenle" }).click();
  await other.getByRole("textbox", { name: "Açıklama" }).fill(draft);
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Düzenle" }).click();
  await panel.getByRole("textbox", { name: "Açıklama" }).fill("İlk kaydedilen metin");
  await panel.getByRole("button", { name: "Kaydet" }).click();
  await expect(panel.getByText("İlk kaydedilen metin")).toBeVisible();
  await other.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
  await expect(other.getByText(CONFLICT)).toBeVisible();
  await expect(other.getByRole("textbox", { name: "Açıklama" })).toHaveValue(draft);
  await other.close();

  // 3. On a touch screen a long press lifts the card and a drag moves it (a quick swipe scrolls).
  const phone = await page.context().browser()!.newContext({ ...devices["Pixel 7"], storageState: await page.context().storageState() });
  const p = await phone.newPage();
  await p.goto("/projects/ESZ", { waitUntil: "networkidle" });
  const card = (await p.getByRole("region", { name: "Devam ediyor" }).getByRole("listitem").filter({ hasText: "Ortak kart" }).boundingBox())!;
  const to = (await p.getByRole("region", { name: "Yapılacak" }).boundingBox())!;
  const cdp = await phone.newCDPSession(p);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const [x0, y0] = [card.x + 20, card.y + 12];
  await touch("touchStart", x0, y0);
  await p.waitForTimeout(400);
  const [x1, y1] = [Math.max(to.x + 40, 20), to.y + 60];
  for (let i = 1; i <= 15; i++) await touch("touchMove", x0 + ((x1 - x0) * i) / 15, y0 + ((y1 - y0) * i) / 15);
  await touch("touchEnd", x1, y1);
  await expect(p.getByRole("region", { name: "Yapılacak" }).getByText("Ortak kart")).toBeVisible();
  await p.reload();
  await expect(p.getByRole("region", { name: "Yapılacak" }).getByText("Ortak kart")).toBeVisible();
  await phone.close();
});
