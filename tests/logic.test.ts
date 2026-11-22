import { beforeAll, describe, expect, it } from "vitest";
import { addDays, today, weekStart } from "@/lib/dates";
import { fold } from "@/lib/fold";
import { catalogs, makeI18n } from "@/lib/i18n";
import * as account from "@/server/account";
import * as admin from "@/server/admin";
import { exportCsv } from "@/server/export";
import * as notifications from "@/server/notifications";
import * as projects from "@/server/projects";
import * as tasks from "@/server/tasks";
import * as views from "@/server/views";
import { expectCode, makeCompany, PW, versionOf } from "./helpers";

let C: Awaited<ReturnType<typeof makeCompany>>;
beforeAll(async () => {
  C = await makeCompany();
});

describe("Turkish-aware search", () => {
  it("folds case and diacritics the Turkish way", () => {
    expect(fold("İstanbul")).toBe(fold("istanbul"));
    expect(fold("ILIK")).toBe(fold("ılık"));
    expect(fold("ÇAY ŞÖLENİ")).toBe("cay soleni");
    expect(fold("Ğ")).toBe("g");
  });
  it("finds tasks regardless of case and Turkish letters", async () => {
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "ILIK su sistemi", labels: ["Tesisat"] });
    const titles = async (q: string) => (await tasks.searchTasks(C.ctx.member, q)).map((t) => t.title);
    expect(await titles("istanbul")).toContain("İstanbul ofisi taşınması");
    expect(await titles("ISTANBUL")).toContain("İstanbul ofisi taşınması");
    expect(await titles("ılık")).toContain("ILIK su sistemi");
    expect(await titles("tasinmasi")).toContain("İstanbul ofisi taşınması");
    expect(await titles("tesisat")).toContain("ILIK su sistemi");
    expect(await titles("web-1")).toContain("İstanbul ofisi taşınması");
    expect(await titles("%")).toEqual([]);
  });
});

describe("concurrent edits", () => {
  it("rejects a stale version instead of overwriting", async () => {
    const { taskId, key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Çakışma" });
    const v = await versionOf(C.ctx.admin, key);
    const r = await tasks.updateTask(C.ctx.admin, { taskId, version: v, title: "Birinci" });
    expect(r.version).toBe(v + 1);
    await expectCode(tasks.updateTask(C.ctx.manager, { taskId, version: v, title: "İkinci" }), "conflict");
    await expectCode(tasks.moveTask(C.ctx.manager, { taskId, version: v, columnId: C.cols[1].id, index: 0 }), "conflict");
    expect((await tasks.getTaskDetail(C.ctx.admin, key)).task.title).toBe("Birinci");
  });
});

describe("moving cards", () => {
  it("orders by index and stamps completion when entering a done column", async () => {
    const ids: string[] = [];
    for (const title of ["a", "b", "c"]) ids.push((await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[1].id, title })).taskId);
    const order = async () =>
      (await projects.getBoard(C.ctx.admin, "WEB")).tasks.filter((t) => t.columnId === C.cols[1].id).map((t) => t.title);
    expect(await order()).toEqual(["c", "b", "a"]);
    const board = await projects.getBoard(C.ctx.admin, "WEB");
    const a = board.tasks.find((t) => t.id === ids[0])!;
    await tasks.moveTask(C.ctx.admin, { taskId: a.id, version: a.version, columnId: C.cols[1].id, index: 1 });
    expect(await order()).toEqual(["c", "a", "b"]);
    const c = board.tasks.find((t) => t.id === ids[2])!;
    await tasks.moveTask(C.ctx.admin, { taskId: c.id, version: c.version, columnId: C.cols[3].id, index: 0 });
    const d = await tasks.getTaskDetail(C.ctx.admin, c.key);
    expect(d.task.completedAt).toBeInstanceOf(Date);
    expect(d.activity.some((x) => x.type === "moved")).toBe(true);
    await tasks.moveTask(C.ctx.admin, { taskId: c.id, version: d.task.version, columnId: C.cols[0].id, index: 0 });
    expect((await tasks.getTaskDetail(C.ctx.admin, c.key)).task.completedAt).toBeNull();
  });
  it("computes midpoints between neighbours", async () => {
    const board = await projects.getBoard(C.ctx.admin, "WEB");
    const col = board.tasks.filter((t) => t.columnId === C.cols[1].id);
    expect(col.every((t, i) => i === 0 || t.position > col[i - 1].position)).toBe(true);
  });
});

describe("aggregates on the board and roles", () => {
  it("counts checklist items, comments and role holders per row", async () => {
    const { taskId, key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Sayılar" });
    await tasks.addChecklistItem(C.ctx.admin, { taskId, text: "bir" });
    await tasks.addChecklistItem(C.ctx.admin, { taskId, text: "iki" });
    const items = (await tasks.getTaskDetail(C.ctx.admin, key)).checklist;
    await tasks.toggleChecklistItem(C.ctx.admin, { itemId: items[0].id, done: true });
    await tasks.addComment(C.ctx.admin, { taskId, body: "not" });
    const card = (await projects.getBoard(C.ctx.admin, "WEB")).tasks.find((t) => t.id === taskId)!;
    expect(card).toMatchObject({ checklistTotal: 2, checklistDone: 1, commentCount: 1 });
    const roles = await admin.listRoles(C.ctx.admin);
    expect(roles.find((r) => r.builtin === "member")!.users).toBe(2);
  });
});

describe("copying a task", () => {
  it("copies fields and an unticked checklist, not assignees", async () => {
    const { taskId } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Şablon", priority: "high", labels: ["süreç"], assigneeIds: [C.ids.member] });
    await tasks.addChecklistItem(C.ctx.admin, { taskId, text: "adım" });
    const copy = await tasks.copyTask(C.ctx.admin, { taskId });
    const d = await tasks.getTaskDetail(C.ctx.admin, copy.key);
    expect(d.task).toMatchObject({ title: "Kopya: Şablon", priority: "high", labels: ["süreç"], assigneeIds: [] });
    expect(d.checklist.map((c) => [c.text, c.done])).toEqual([["adım", false]]);
  });
});

describe("mentions and notifications", () => {
  it("notifies mentioned and assigned people, not the actor", async () => {
    const handle = C.ctx.member.email.split("@")[0];
    await tasks.addComment(C.ctx.admin, { taskId: C.taskId, body: `@${handle} bakabilir misin? @${C.ctx.admin.email.split("@")[0]}` });
    const list = await notifications.listNotifications(C.ctx.member);
    expect(list[0]).toMatchObject({ type: "mentioned", taskKey: C.key });
    expect((await notifications.listNotifications(C.ctx.admin)).some((n) => n.type === "mentioned")).toBe(false);
    const before = await notifications.unreadCount(C.ctx.member);
    await notifications.markNotificationsRead(C.ctx.member, {});
    expect(before).toBeGreaterThan(0);
    expect(await notifications.unreadCount(C.ctx.member)).toBe(0);
  });
  it("creates one due-tomorrow reminder per task and day", async () => {
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Yarın", dueDate: today(1), assigneeIds: [C.ids.member] });
    await notifications.listNotifications(C.ctx.member);
    await notifications.listNotifications(C.ctx.member);
    const due = (await notifications.listNotifications(C.ctx.member)).filter((n) => n.type === "due_tomorrow");
    expect(due).toHaveLength(1);
  });
});

describe("my work, team and dashboard", () => {
  it("groups by column category with overdue first", async () => {
    const m = C.ctx.member2;
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Geç kaldı", dueDate: today(-3), assigneeIds: [m.userId] });
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[1].id, title: "Üzerinde", assigneeIds: [m.userId] });
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[3].id, title: "Bitti", assigneeIds: [m.userId] });
    const w = await views.myWork(m);
    expect(w.todo[0].title).toBe("Geç kaldı");
    expect(w.todo[0].overdue).toBe(true);
    expect(w.doing.map((t) => t.title)).toEqual(["Üzerinde"]);
    expect(w.done.map((t) => t.title)).toEqual(["Bitti"]);
    expect(w.overdue).toBe(1);
    const row = (await views.team(C.ctx.viewer)).find((p) => p.id === m.userId)!;
    expect(row.doing).toHaveLength(1);
    expect(row.done).toHaveLength(1);
    const dash = await views.dashboard(C.ctx.manager);
    expect(dash.overdue.map((t) => t.title)).toContain("Geç kaldı");
    expect(dash.perWeek).toHaveLength(8);
    expect(dash.perWeek.at(-1)!.done).toBeGreaterThan(0);
  });
  it("hides restricted-project work from people who cannot see it", async () => {
    const { taskId } = await tasks.createTask(C.ctx.admin, { projectId: C.secretId, title: "Gizli görev", assigneeIds: [C.ids.member2] });
    expect(JSON.stringify(await views.person(C.ctx.member, C.ids.member2))).not.toContain(taskId);
    expect(JSON.stringify(await views.person(C.ctx.member2, C.ids.member2))).toContain(taskId);
  });
});

describe("sign-in protection", () => {
  it("locks the account after 5 wrong passwords", async () => {
    const email = `manager-${C.tag}@x.test`;
    for (let i = 0; i < 4; i++) await expectCode(account.login({ email, password: "yanlis" }, `ip-${i}`), "bad_credentials");
    await expectCode(account.login({ email, password: "yanlis" }, "ip-x"), "locked");
    await expectCode(account.login({ email, password: PW }, "ip-y"), "locked");
  });
  it("rejects weak passwords at sign-up", async () => {
    await expectCode(account.signupCompany({ company: "Zayıf", name: "a", email: "weak@x.test", password: "sadeceharf", locale: "tr" }), "weak_password");
    await expectCode(account.signupCompany({ company: "Zayıf", name: "a", email: "weak@x.test", password: "123456789012", locale: "tr" }), "weak_password");
  });
  it("stores scrypt hashes, never the password", async () => {
    const h = await account.hashPassword("Gizli12345x");
    expect(h).toMatch(/^scrypt\$\d+\$/);
    expect(await account.verifyPassword("Gizli12345x", h)).toBe(true);
    expect(await account.verifyPassword("Gizli12345y", h)).toBe(false);
    expect(await account.verifyPassword("x", null)).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralises spreadsheet formulas", async () => {
    await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: '=HYPERLINK("x") "tırnak"' });
    const csv = await exportCsv(C.ctx.admin, "WEB", () => "Yapılacak", ["Anahtar", "Başlık"]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"") ""tırnak"""`);
  });
});

describe("i18n", () => {
  it("has the same keys in every catalog, all non-empty", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(catalogs.en)).toEqual(keys(catalogs.tr));
    const values = (o: object): unknown[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? values(v) : [v]));
    expect(values(catalogs.en).every((v) => typeof v === "string" && v.length > 0)).toBe(true);
    expect(values(catalogs.tr).every((v) => typeof v === "string" && v.length > 0)).toBe(true);
  });
  it("formats plurals and dates per locale", () => {
    const en = makeI18n("en");
    const trI = makeI18n("tr");
    expect(en.plural(en.m.search.results, 1)).toBe("1 result");
    expect(en.plural(en.m.search.results, 3)).toBe("3 results");
    expect(trI.plural(trI.m.search.results, 3)).toBe("3 sonuç");
    expect(trI.day("2026-03-05", { day: "numeric", month: "long" })).toBe("5 Mart");
    expect(en.day("2026-03-05", { day: "numeric", month: "long" })).toBe("5 March");
    expect(trI.num(1234.5)).toBe("1.234,5");
  });
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
