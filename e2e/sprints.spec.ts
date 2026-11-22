import { expect, test } from "playwright/test";

const stamp = Date.now().toString(36);

test("a team lead plans a sprint, runs it on the board and completes it", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => m.text().includes("Content Security Policy") && cspErrors.push(m.text()));
  page.on("dialog", (d) => void d.accept());

  await page.goto("/signup");
  await page.getByLabel("Şirket adı").fill("Sprint Deneme Ltd.");
  await page.getByLabel("Adınız soyadınız").fill("Ömer Çınar");
  await page.getByLabel("E-posta").fill(`lead-${stamp}@e2e.test`);
  await page.getByLabel("Parola", { exact: true }).fill("E2eParola2026");
  await page.getByRole("button", { name: "Hesabı oluştur" }).click();
  await expect(page.getByRole("heading", { name: "İşlerim" })).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "Yeni proje" }).click();
  await page.getByLabel("Anahtar", { exact: true }).fill("SPR");
  await page.getByLabel("Proje adı").fill("Sprint Projesi");
  await page.getByRole("button", { name: "Oluştur" }).click();
  await expect(page.getByRole("heading", { name: /Sprint Projesi/ })).toBeVisible();
  await page.goto("/projects/SPR", { waitUntil: "networkidle" });
  for (const title of ["Giriş sayfası", "Şifre sıfırlama"]) {
    await page.keyboard.press("c");
    await page.getByLabel("Başlık").fill(title);
    await page.getByRole("button", { name: "Görevi oluştur" }).click();
    await expect(page.getByRole("region", { name: "Yapılacak" }).getByText(title)).toBeVisible();
  }

  // Planning tab: no sprints yet, so it explains them; create one and plan a task into it.
  await page.getByRole("link", { name: "Planlama" }).click();
  await expect(page.getByText("Sprintlerle çalışmak isterseniz")).toBeVisible();
  await page.getByRole("button", { name: "Sprint oluştur" }).first().click();
  await page.getByLabel("Sprint hedefi").fill("Giriş akışı hazır");
  await page.getByRole("dialog").getByRole("button", { name: "Oluştur" }).click();
  const sprint = page.getByRole("region", { name: /Sprint 1/ });
  await expect(sprint.getByText("Bu sprintte görev yok")).toBeVisible();
  await page.getByLabel("SPR-1 hangi sprintte").selectOption({ label: "Sprint 1" });
  await expect(sprint.getByRole("link", { name: "Giriş sayfası" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Bekleyen işler/ }).getByRole("link", { name: "Şifre sıfırlama" })).toBeVisible();

  // Start it: the board now shows the sprint's tasks only, with its countdown and goal.
  await sprint.getByRole("button", { name: "Sprinti başlat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sprinti başlat" }).click();
  await expect(sprint.getByText("Devam ediyor", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Pano", exact: true }).click();
  await expect(page.getByText("Sprint hedefi:")).toBeVisible();
  await expect(page.getByText("13 gün kaldı")).toBeVisible();
  await expect(page.getByRole("link", { name: "Giriş sayfası" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Şifre sıfırlama" })).toHaveCount(0);
  await page.getByLabel("Gösterilen görevler").selectOption({ label: "Tüm görevler" });
  await expect(page.getByRole("link", { name: "Şifre sıfırlama" })).toBeVisible();

  // A task created while the board shows the sprint joins the sprint.
  await page.getByLabel("Gösterilen görevler").selectOption({ label: "Sprint 1 (devam ediyor)" });
  await page.keyboard.press("c");
  await page.getByLabel("Başlık").fill("Oturum süresi");
  await page.getByRole("button", { name: "Görevi oluştur" }).click();
  await expect(page.getByRole("region", { name: "Yapılacak" }).getByText("Oturum süresi")).toBeVisible();

  // Finish one task, then complete the sprint: the unfinished ones go back to the backlog.
  await page.getByRole("link", { name: "Giriş sayfası" }).click();
  await page.getByRole("dialog").getByLabel("Durum").selectOption({ label: "Tamamlandı" });
  await expect(page.getByText("SPR-1, Tamamlandı sütununa taşındı")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("1/2 görev bitti")).toBeVisible();
  await page.getByRole("link", { name: "Planlama" }).click();
  await sprint.getByRole("button", { name: "Sprinti tamamla" }).click();
  await expect(page.getByRole("dialog").getByText("1 görev bitti, 1 görev bitmedi.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Sprinti tamamla" }).click();
  const done = page.getByRole("region", { name: "Tamamlanan sprintler" });
  await expect(done.getByText("1 görev · 0 puan tamamlandı")).toBeVisible();
  await expect(page.getByRole("region", { name: /Bekleyen işler/ }).getByRole("link", { name: "Oturum süresi" })).toBeVisible();

  // With no sprint running the board shows every task again.
  await page.getByRole("link", { name: "Pano", exact: true }).click();
  await expect(page.getByRole("link", { name: "Şifre sıfırlama" })).toBeVisible();
  await expect(page.getByText("Sprint hedefi:")).toHaveCount(0);
  expect(cspErrors).toEqual([]);
});
