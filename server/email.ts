export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — password reset email was not sent.");
    return;
  }

  const fromEnv = process.env.RESEND_FROM_EMAIL;
  if (!fromEnv) {
    const msg =
      "[email] RESEND_FROM_EMAIL is not set. " +
      "Set it to a verified Resend sender address (e.g. 'EdenMux <noreply@edenmux.com>') " +
      "before sending password reset emails.";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    console.warn(msg + " — skipping send in development.");
    return;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{background:#0e0e0f;color:#e8d5c4;font-family:Georgia,serif;margin:0;padding:40px 16px}
    .card{max-width:480px;margin:0 auto;background:#1a1a1b;border:1px solid rgba(200,75,110,.2);border-radius:16px;padding:40px 32px;text-align:center}
    h1{font-size:22px;letter-spacing:3px;color:#e8d5c4;margin:0 0 8px;text-transform:uppercase}
    .sub{color:#a07890;font-size:13px;margin:0 0 28px;line-height:1.6}
    .btn{display:inline-block;padding:14px 36px;background:#c84b6e;color:#fff;border-radius:10px;text-decoration:none;font-size:13px;letter-spacing:1px;font-family:Georgia,serif}
    .note{margin-top:28px;font-size:11px;color:rgba(160,120,144,.5);line-height:1.7}
  </style>
</head>
<body>
  <div class="card">
    <h1>EdenMux</h1>
    <p class="sub">You requested a password reset.<br>This link expires in <strong style="color:#e8d5c4">1 hour</strong> and can only be used once.</p>
    <a href="${resetUrl}" class="btn">Reset My Password</a>
    <p class="note">If you didn't request this, ignore this email — your password won't change.<br>Link: ${resetUrl}</p>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEnv,
      to,
      subject: "Reset your EdenMux password",
      html,
    }),
  });

  if (!res.ok) {
    console.error(`[email] Resend request failed with HTTP ${res.status}.`);
    throw new Error("Email delivery failed");
  }
  console.log("[email] Reset email sent successfully");
}
