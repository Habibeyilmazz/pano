/** Codes map to messages in the i18n catalogs (errors.*). */
export type ErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "conflict"
  | "unauthenticated"
  | "email_taken"
  | "key_taken"
  | "bad_credentials"
  | "locked"
  | "weak_password"
  | "invite_invalid"
  | "last_admin"
  | "role_in_use"
  | "column_not_empty"
  | "wip_limit"
  | "sprint_active"
  | "sprint_state";

export class AppError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

export const fail = (code: ErrorCode): never => {
  throw new AppError(code);
};
