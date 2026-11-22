/**
 * Email hook. v0.1 sends nothing: the admin copies the invite/reset link from the screen.
 * To add SMTP later, implement this function (e.g. with nodemailer and SMTP_* env vars) and
 * return true when the message was sent; callers already pass everything needed.
 */
export async function sendAccessLink(_msg: { to: string; name: string; url: string; kind: "invite" | "reset"; locale: string }): Promise<boolean> {
  return false;
}
