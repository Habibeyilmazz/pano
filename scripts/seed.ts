/**
 * Demo data: a fictional company, "Örnek Yazılım A.Ş.", with 8 people, 2 projects plus the built-in Genel İşler board, and ~45 tasks.
 * Usage: npm run seed            (adds the demo company; refuses if it already exists)
 *        npm run seed -- --if-empty   (only when the database has no companies; used by npm run dev)
 * All names, emails and passwords are fictional and for local demos only.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "../src/db";
import { addDays, today } from "../src/lib/dates";
import * as account from "../src/server/account";
import * as admin from "../src/server/admin";
import { getProject, loadCtx } from "../src/server/ctx";
import * as projects from "../src/server/projects";
import * as sprints from "../src/server/sprints";
import * as tasks from "../src/server/tasks";

export const DEMO_PASSWORD = "PanoDemo2026";

const people = [
  { key: "ayse", name: "Ayşe Yılmaz", role: "admin" },
  { key: "mehmet", name: "Mehmet Kaya", role: "manager" },
  { key: "zeynep", name: "Zeynep Demir", role: "member" },
  { key: "emre", name: "Emre Şahin", role: "member" },
  { key: "elif", name: "Elif Çelik", role: "member" },
  { key: "burak", name: "Burak Öztürk", role: "member" },
  { key: "ismail", name: "İsmail Doğan", role: "intern" },
  { key: "selin", name: "Selin Arslan", role: "viewer", locale: "en" },
] as const;
type P = (typeof people)[number]["key"];

type Seed = {
  title: string;
  col: 0 | 1 | 2 | 3;
  pri: "lowest" | "low" | "medium" | "high" | "highest";
  who: P[];
  due?: number;
  pts?: number;
  labels?: string[];
  desc?: string;
  doneAgo?: number;
  check?: [string, boolean][];
  comments?: [P, string][];
};

const web: Seed[] = [
  { title: "Ana sayfa tasarımını yenile", col: 1, pri: "high", who: ["zeynep"], due: 3, pts: 8, labels: ["tasarım"], desc: "Yeni marka kılavuzuna göre ana sayfa.\n\n- Hero alanı\n- Müşteri logoları\n- İletişim çağrısı", check: [["Taslak çizimler", true], ["Renk paleti onayı", true], ["Mobil görünüm", false]], comments: [["mehmet", "@zeynep cuma günü müşteriyle paylaşabilir miyiz?"], ["zeynep", "Evet, perşembe akşamı hazır olur."]] },
  { title: "İletişim formuna spam koruması ekle", col: 3, pri: "medium", who: ["emre"], pts: 3, labels: ["güvenlik"], doneAgo: 6 },
  { title: "Blog sayfalarında yavaş yüklenme sorunu", col: 1, pri: "highest", who: ["emre", "burak"], due: -2, pts: 5, labels: ["hata", "performans"], desc: "Blog listesi 4 saniyede açılıyor. Görseller optimize edilmeli ve sayfalama eklenmeli.", comments: [["burak", "Görselleri WebP'ye çevirdim, şimdi sorguya bakıyorum."]] },
  { title: "KVKK aydınlatma metnini güncelle", col: 2, pri: "high", who: ["elif", "ayse"], due: 1, pts: 2, labels: ["hukuk"] },
  { title: "Çerez onay penceresi", col: 3, pri: "medium", who: ["emre"], pts: 3, labels: ["hukuk"], doneAgo: 2 },
  { title: "Ürün karşılaştırma tablosu", col: 0, pri: "medium", who: [], due: 12, pts: 5, labels: ["tasarım"] },
  { title: "İngilizce sürüm için çeviri akışı", col: 0, pri: "low", who: ["elif"], pts: 8, labels: ["içerik"] },
  { title: "Site haritası ve robots.txt", col: 3, pri: "low", who: ["burak"], pts: 1, labels: ["seo"], doneAgo: 4 },
  { title: "Arama kutusunda Türkçe karakter hatası", col: 3, pri: "high", who: ["burak"], doneAgo: 1, pts: 2, labels: ["hata"], desc: "\"İstanbul\" araması \"istanbul\" ile eşleşmiyor." },
  { title: "Kariyer sayfasına ilan filtresi", col: 0, pri: "medium", who: ["ismail"], due: 9, pts: 3, labels: ["içerik"] },
  { title: "Müşteri yorumları bölümü", col: 3, pri: "medium", who: ["zeynep"], pts: 3, labels: ["tasarım"], doneAgo: 9 },
  { title: "Sunucu yedeklemelerini doğrula", col: 0, pri: "highest", who: ["mehmet"], due: -5, pts: 2, labels: ["altyapı"] },
  { title: "Google Analytics yerine gizlilik dostu analitik", col: 0, pri: "low", who: [], pts: 5, labels: ["altyapı"] },
  { title: "Fiyatlandırma sayfası metinleri", col: 1, pri: "medium", who: ["elif", "ismail"], due: 4, pts: 2, labels: ["içerik"] },
  { title: "Erişilebilirlik denetimi (WCAG AA)", col: 2, pri: "high", who: ["zeynep"], due: 2, pts: 5, labels: ["erişilebilirlik"], check: [["Kontrast oranları", true], ["Klavye ile gezinme", true], ["Ekran okuyucu testi", false]] },
  { title: "404 sayfası", col: 3, pri: "lowest", who: ["ismail"], pts: 1, labels: ["tasarım"], doneAgo: 16 },
  { title: "Bülten aboneliği entegrasyonu", col: 3, pri: "medium", who: ["emre"], pts: 3, labels: ["entegrasyon"], doneAgo: 23 },
  { title: "Favicon ve sosyal paylaşım görselleri", col: 3, pri: "low", who: ["zeynep"], pts: 1, labels: ["tasarım"], doneAgo: 30 },
  { title: "Canlıya çıkış kontrol listesi", col: 0, pri: "high", who: ["mehmet", "ayse"], due: 14, pts: 3, labels: ["süreç"], check: [["DNS ayarları", false], ["SSL sertifikası", false], ["Yönlendirmeler", false]] },
  { title: "Eski blog yazılarını taşı", col: 1, pri: "low", who: ["ismail"], due: -1, pts: 5, labels: ["içerik"] },
];

const mob: Seed[] = [
  { title: "Giriş ekranında biyometrik doğrulama", col: 1, pri: "high", who: ["burak"], due: 5, pts: 8, labels: ["güvenlik"], desc: "Face ID ve parmak izi ile giriş. Başarısız denemede parolaya dönülmeli." },
  { title: "Bildirim izinleri akışı", col: 0, pri: "medium", who: ["elif"], due: 7, pts: 3, labels: ["ux"] },
  { title: "Android 15 uyumluluk testi", col: 2, pri: "highest", who: ["emre"], due: -1, pts: 5, labels: ["test"], comments: [["emre", "Pixel cihazlarda kamera izni hatası var, düzeltme incelemede."], ["mehmet", "@emre yarınki sürüme yetişir mi?"]] },
  { title: "Sepet ekranı yeniden tasarımı", col: 1, pri: "medium", who: ["zeynep", "elif"], due: 10, pts: 5, labels: ["tasarım"] },
  { title: "Çevrimdışı mod için önbellek", col: 0, pri: "low", who: [], pts: 13, labels: ["altyapı"] },
  { title: "Uygulama içi ödeme hatası (iOS)", col: 1, pri: "highest", who: ["burak"], due: -3, pts: 3, labels: ["hata", "ödeme"], desc: "Bazı kullanıcılar ödeme sonrası boş ekran görüyor. Kayıtlar ekte." },
  { title: "Karanlık mod desteği", col: 3, pri: "medium", who: ["zeynep"], pts: 5, labels: ["tasarım"], doneAgo: 1 },
  { title: "Uygulama mağazası ekran görüntüleri", col: 0, pri: "low", who: ["ismail"], due: 15, pts: 2, labels: ["pazarlama"] },
  { title: "Kullanıcı profili düzenleme", col: 3, pri: "medium", who: ["emre"], pts: 3, labels: ["ux"], doneAgo: 3 },
  { title: "Sipariş takibi ekranı", col: 2, pri: "high", who: ["elif"], due: 2, pts: 5, labels: ["ux"] },
  { title: "Çökme raporlama aracı kurulumu", col: 3, pri: "high", who: ["burak", "ayse"], pts: 2, labels: ["altyapı"], doneAgo: 8 },
  { title: "Türkçe ve İngilizce dil dosyaları", col: 3, pri: "medium", who: ["ismail", "elif"], pts: 3, labels: ["içerik"], doneAgo: 11 },
  { title: "Push bildirim sunucusu", col: 0, pri: "medium", who: ["burak"], due: 20, pts: 8, labels: ["altyapı"] },
  { title: "Kampanya kodu girişi", col: 0, pri: "medium", who: [], due: 8, pts: 3, labels: ["ödeme"] },
  { title: "Beta test kullanıcı geri bildirimleri", col: 1, pri: "medium", who: ["mehmet", "ayse"], due: 2, pts: 2, labels: ["süreç"] },
  { title: "Uygulama açılış süresini kısalt", col: 0, pri: "high", who: ["emre"], due: 6, pts: 5, labels: ["performans"] },
  { title: "Ürün listesinde sonsuz kaydırma", col: 3, pri: "low", who: ["zeynep"], pts: 3, labels: ["ux"], doneAgo: 18 },
  { title: "Adres seçiminde harita", col: 0, pri: "lowest", who: [], pts: 5, labels: ["ux"] },
  { title: "Erişilebilirlik etiketleri (VoiceOver)", col: 2, pri: "medium", who: ["ismail"], due: 4, pts: 3, labels: ["erişilebilirlik"] },
  { title: "Sürüm 2.4 notları", col: 0, pri: "low", who: ["elif"], due: 3, pts: 1, labels: ["içerik"] },
];

// Company work outside any project, on the board every company starts with.
const gen: Seed[] = [
  { title: "Ofis internet sözleşmesini yenile", col: 0, pri: "medium", who: ["ayse"], due: 9, labels: ["ofis"] },
  { title: "Yeni çalışan için bilgisayar ve hesaplar", col: 1, pri: "high", who: ["burak"], due: 2, labels: ["işe alım"], check: [["Dizüstü bilgisayar", true], ["E-posta hesabı", false], ["pano hesabı", false]] },
  { title: "KVKK aydınlatma metnini güncelle", col: 0, pri: "high", who: ["mehmet"], due: 12, labels: ["hukuk"] },
  { title: "Kasım fatura ödemeleri", col: 3, pri: "medium", who: ["ayse"], labels: ["muhasebe"], doneAgo: 2 },
  { title: "Yılsonu ekip yemeği", col: 0, pri: "low", who: [], due: 18, labels: ["ofis"] },
];

async function main() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.workspaces);
  if (process.argv.includes("--if-empty") && n > 0) return;

  const ws = await account.signupCompany({
    company: "Örnek Yazılım A.Ş.",
    name: people[0].name,
    email: "ayse@ornek.test",
    password: DEMO_PASSWORD,
    locale: "tr",
  });
  const adminCtx = (await loadCtx(ws.userId))!;
  await admin.createRole(adminCtx, {
    name: "Stajyer",
    permissions: ["tasks.create", "tasks.assign_self", "comments.create"],
  });
  const roles = await admin.listRoles(adminCtx);
  const roleId = (r: string) => roles.find((x) => x.builtin === r || (r === "intern" && x.name === "Stajyer"))!.id;

  const ids: Record<string, string> = { ayse: ws.userId };
  for (const p of people.slice(1)) {
    const { userId } = await admin.createUser(adminCtx, {
      name: p.name,
      email: `${p.key}@ornek.test`,
      roleId: roleId(p.role),
      locale: "locale" in p ? p.locale : "tr",
      mode: "password",
      password: DEMO_PASSWORD,
    });
    ids[p.key] = userId;
  }
  await db.update(s.users).set({ mustChangePassword: false }).where(eq(s.users.workspaceId, ws.workspaceId));

  const mehmet = (await loadCtx(ids.mehmet))!;
  const projectDefs = [
    { key: "WEB", name: "Web Sitesi Yenileme", description: "Kurumsal web sitesinin yeni marka kimliğiyle baştan yapılması.", seeds: web },
    { key: "MOB", name: "Mobil Uygulama", description: "iOS ve Android müşteri uygulaması, sürüm 2.4.", seeds: mob },
    { key: projects.GENERAL_PROJECT.key, name: "", description: "", seeds: gen }, // created at sign-up
  ];
  const t0 = today();
  const webTasks: { sd: Seed; taskId: string }[] = [];
  for (const def of projectDefs) {
    const projectId = def.seeds === gen
      ? (await getProject(adminCtx, { key: def.key })).id
      : (await projects.createProject(adminCtx, { key: def.key, name: def.name, description: def.description })).projectId;
    const cols = await projects.projectColumns(projectId);
    // A WIP limit on "In progress" so the board shows what an exceeded limit looks like.
    if (def.key === "WEB") await projects.updateColumn(adminCtx, { columnId: cols[1].id, name: null, category: "doing", wipLimit: 3 });
    for (const sd of def.seeds) {
      const reporter = sd.who[0] === "ismail" ? mehmet : adminCtx;
      const { taskId } = await tasks.createTask(reporter, {
        projectId,
        columnId: cols[sd.col].id,
        title: sd.title,
        description: sd.desc ?? "",
        priority: sd.pri,
        dueDate: sd.due === undefined ? null : addDays(t0, sd.due),
        estimate: sd.pts ?? null,
        labels: sd.labels ?? [],
        assigneeIds: sd.who.map((w) => ids[w]),
      });
      if (def.key === "WEB") webTasks.push({ sd, taskId });
      for (const [text, done] of sd.check ?? []) {
        await tasks.addChecklistItem(reporter, { taskId, text });
        if (done) {
          const [item] = await db.select().from(s.checklistItems).where(eq(s.checklistItems.taskId, taskId)).orderBy(sql`position desc`).limit(1);
          await tasks.toggleChecklistItem(reporter, { itemId: item.id, done: true });
        }
      }
      for (const [who, body] of sd.comments ?? []) await tasks.addComment((await loadCtx(ids[who]))!, { taskId, body });
      // Old enough that the running sprint's work was all planned before it started (a flat start on the burndown).
      const created = new Date(Date.now() - ((sd.doneAgo ?? 0) + 9 + (sd.pts ?? 1)) * 864e5);
      await db
        .update(s.tasks)
        .set({ createdAt: created, completedAt: sd.doneAgo !== undefined ? new Date(Date.now() - sd.doneAgo * 864e5) : null })
        .where(eq(s.tasks.id, taskId));
      await db.update(s.activities).set({ createdAt: created }).where(sql`${s.activities.taskId} = ${taskId} and ${s.activities.type} = 'created'`);
    }
  }
  await seedSprints(adminCtx, webTasks, t0);
  console.log(`Demo company ready. Sign in as ayse@ornek.test / ${DEMO_PASSWORD}`);
}

/** WEB works in two-week sprints: one completed, one running, one planned. MOB does plain kanban. */
async function seedSprints(ctx: NonNullable<Awaited<ReturnType<typeof loadCtx>>>, list: { sd: Seed; taskId: string }[], t0: string) {
  const db = await getDb();
  const { projectId } = (await db.select({ projectId: s.tasks.projectId }).from(s.tasks).where(eq(s.tasks.id, list[0].taskId)))[0];
  const plan = async (sprintId: string, pick: (sd: Seed) => boolean) => {
    for (const { sd, taskId } of list) if (pick(sd)) await db.update(s.tasks).set({ sprintId }).where(eq(s.tasks.id, taskId));
  };
  const one = await sprints.createSprint(ctx, { projectId, startDate: addDays(t0, -22), endDate: addDays(t0, -9) });
  await plan(one.sprintId, (sd) => sd.doneAgo !== undefined && sd.doneAgo >= 9 && sd.doneAgo <= 16);
  await sprints.startSprint(ctx, { sprintId: one.sprintId, startDate: addDays(t0, -22), endDate: addDays(t0, -9), goal: "Tasarım dili ve temel sayfalar" });
  await sprints.completeSprint(ctx, { sprintId: one.sprintId });
  const two = await sprints.createSprint(ctx, { projectId });
  const three = await sprints.createSprint(ctx, { projectId, startDate: addDays(t0, 6), endDate: addDays(t0, 19), goal: "Canlıya çıkış" });
  await plan(two.sprintId, (sd) => (sd.doneAgo !== undefined && sd.doneAgo < 9) || (sd.col < 3 && sd.due !== undefined && sd.due <= 6));
  await plan(three.sprintId, (sd) => sd.col < 3 && sd.due !== undefined && sd.due > 6);
  await sprints.startSprint(ctx, { sprintId: two.sprintId, startDate: addDays(t0, -8), endDate: addDays(t0, 5), goal: "Yeni ana sayfa ve yasal metinler yayına hazır" });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
