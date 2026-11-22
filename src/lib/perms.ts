export const PERMISSIONS = [
  "users.manage",
  "roles.manage",
  "projects.manage",
  "tasks.create",
  "tasks.edit_any",
  "tasks.delete",
  "tasks.assign_self",
  "tasks.assign_others",
  "comments.create",
  "reports.view",
] as const;

export type Perm = (typeof PERMISSIONS)[number];
export type BuiltinRole = "admin" | "manager" | "member" | "viewer";

export const BUILTIN_ROLES: Record<BuiltinRole, readonly Perm[]> = {
  admin: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== "users.manage" && p !== "roles.manage"),
  member: ["tasks.create", "tasks.assign_self", "tasks.assign_others", "comments.create"],
  viewer: [],
};

export const isPerm = (p: string): p is Perm => (PERMISSIONS as readonly string[]).includes(p);
