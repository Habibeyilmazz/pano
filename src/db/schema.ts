import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const ws = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const roles = pgTable("roles", {
  id: id(),
  workspaceId: ws(),
  name: text().notNull(),
  /** admin | manager | member | viewer for built-in roles, null for custom ones */
  builtin: text(),
  permissions: text().array().notNull().default([]),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    workspaceId: ws(),
    roleId: uuid()
      .notNull()
      .references(() => roles.id),
    name: text().notNull(),
    email: text().notNull(),
    passwordHash: text(),
    mustChangePassword: boolean().notNull().default(false),
    inviteTokenHash: text(),
    inviteExpiresAt: timestamp({ withTimezone: true }),
    locale: text().notNull().default("tr"),
    theme: text().notNull().default("system"),
    active: boolean().notNull().default(true),
    failedLogins: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_ws_idx").on(t.workspaceId)],
);

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token; the raw token is never stored */
  id: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: ws(),
    key: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    restricted: boolean().notNull().default(false),
    taskSeq: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("projects_ws_key_idx").on(t.workspaceId, t.key)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    workspaceId: ws(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const columns = pgTable("columns", {
  id: id(),
  workspaceId: ws(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** null = show the translated default name for defaultKey */
  name: text(),
  defaultKey: text(),
  /** todo | doing | done: drives My work, Team and the dashboard */
  category: text().notNull(),
  position: integer().notNull(),
  wipLimit: integer(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: ws(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    columnId: uuid()
      .notNull()
      .references(() => columns.id),
    position: doublePrecision().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    priority: text().notNull().default("medium"),
    reporterId: uuid()
      .notNull()
      .references(() => users.id),
    dueDate: date({ mode: "string" }),
    estimate: real(),
    labels: text().array().notNull().default([]),
    version: integer().notNull().default(1),
    searchText: text().notNull().default(""),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tasks_project_number_idx").on(t.projectId, t.number),
    index("tasks_ws_idx").on(t.workspaceId),
    index("tasks_column_idx").on(t.columnId),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    workspaceId: ws(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("assignees_user_idx").on(t.userId)],
);

export const checklistItems = pgTable("checklist_items", {
  id: id(),
  workspaceId: ws(),
  taskId: uuid()
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  text: text().notNull(),
  done: boolean().notNull().default(false),
  position: integer().notNull(),
});

export const comments = pgTable("comments", {
  id: id(),
  workspaceId: ws(),
  taskId: uuid()
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid()
    .notNull()
    .references(() => users.id),
  body: text().notNull(),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspaceId: ws(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    type: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_task_idx").on(t.taskId), index("activities_actor_idx").on(t.actorId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: ws(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid().references(() => users.id),
    /** set for generated reminders so they are created once */
    dedupeKey: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId), uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey)],
);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  workspaceId: ws(),
  actorId: uuid()
    .notNull()
    .references(() => users.id),
  action: text().notNull(),
  data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});
