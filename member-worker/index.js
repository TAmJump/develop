var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var ALLOWED_ORIGINS = [
  "https://develop.115en.com",
  "https://115en.com",
  "https://develop.tamjump.com",
  "https://tamjump.com",
  "http://localhost:3000"
];
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Credentials": "true"
  };
}
__name(corsHeaders, "corsHeaders");
function json(data, status = 200, request = null) {
  const headers = { "Content-Type": "application/json" };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json, "json");
function redirect(url) {
  return Response.redirect(url, 302);
}
__name(redirect, "redirect");
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    key,
    256
  );
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    key,
    256
  );
  const newHashHex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return newHashHex === hashHex;
}
__name(verifyPassword, "verifyPassword");
async function createSession(env, userId) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(id, userId, expiresAt).run();
  return { id, expiresAt };
}
__name(createSession, "createSession");
async function getSession(env, sessionId) {
  if (!sessionId) return null;
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at,
            u.email, u.name, u.plan, u.email_verified, u.pro_expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first();
  if (!row) return null;
  if (row.plan === "paid" && row.pro_expires_at && row.pro_expires_at < (/* @__PURE__ */ new Date()).toISOString()) {
    await env.DB.prepare(
      `UPDATE users SET plan = 'free', updated_at = datetime('now') WHERE id = ?`
    ).bind(row.user_id).run();
    await sendEmail(env, row.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011Pro\u30D7\u30E9\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F", emailSubscriptionExpiredTemplate(row.name));
    row.plan = "free";
  }
  return row;
}
__name(getSession, "getSession");
function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/tamj_session=([^;]+)/);
  if (match) return match[1];
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
__name(getSessionId, "getSessionId");
function sessionCookie(sessionId, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `tamj_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`;
}
__name(sessionCookie, "sessionCookie");
function clearSessionCookie() {
  return "tamj_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
__name(clearSessionCookie, "clearSessionCookie");
async function sha256hex(message) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
async function hmacSHA256(key, message) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}
__name(hmacSHA256, "hmacSHA256");
async function getAWSSigningKey(secret, dateStamp, region, service) {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return hmacSHA256(kService, "aws4_request");
}
__name(getAWSSigningKey, "getAWSSigningKey");
async function sendEmail(env, to, subject, htmlBody) {
  const region = env.AWS_REGION || "ap-northeast-1";
  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const payload = JSON.stringify({
    FromEmailAddress: env.FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: htmlBody, Charset: "UTF-8" } }
      }
    }
  });
  const now = /* @__PURE__ */ new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const host = `email.${region}.amazonaws.com`;
  const payloadHash = await sha256hex(payload);
  const canonicalHeaders = `content-type:application/json
host:${host}
x-amz-date:${amzDate}
`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalReq = ["POST", "/v2/email/outbound-emails", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256
${amzDate}
${credentialScope}
${await sha256hex(canonicalReq)}`;
  const signingKey = await getAWSSigningKey(env.AWS_SECRET_ACCESS_KEY, dateStamp, region, "ses");
  const sigHex = [...new Uint8Array(await hmacSHA256(signingKey, stringToSign))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sigHex}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Date": amzDate,
      "Authorization": authHeader
    },
    body: payload
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("SES Error:", errText);
    return false;
  }
  return true;
}
__name(sendEmail, "sendEmail");
function emailVerifyTemplate(name, verifyUrl) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="background:#e8e8e8;padding:32px 40px">
    <div style="color:#111;font-size:22px;font-weight:700">\u30BF\u30E0\u30B8.develop</div>
    <div style="color:#666;font-size:13px;margin-top:4px">\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u78BA\u8A8D</div>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 16px;color:#111;font-size:15px">${name} \u69D8</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.8">
      \u30BF\u30E0\u30B8.develop \u3078\u306E\u3054\u767B\u9332\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002<br>
      \u4E0B\u306E\u30DC\u30BF\u30F3\u3092\u62BC\u3057\u3066\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002
    </p>
    <a href="${verifyUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u78BA\u8A8D\u3059\u308B</a>
    <p style="margin:24px 0 0;color:#999;font-size:12px">
      \u3053\u306E\u30EA\u30F3\u30AF\u306F24\u6642\u9593\u6709\u52B9\u3067\u3059\u3002<br>
      \u5FC3\u5F53\u305F\u308A\u304C\u306A\u3044\u5834\u5408\u306F\u7121\u8996\u3057\u3066\u304F\u3060\u3055\u3044\u3002
    </p>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;color:#aaa;font-size:11px">
    \u30BF\u30E0\u30B8\u682A\u5F0F\u4F1A\u793E / noreply@tamjump.com
  </div>
</div>
</body></html>`;
}
__name(emailVerifyTemplate, "emailVerifyTemplate");
function emailWelcomeTemplate(name) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#111;padding:32px 40px">
    <div style="color:#fff;font-size:22px;font-weight:700">TAmJump develop</div>
    <div style="color:#aaa;font-size:13px;margin-top:4px">\u767B\u9332\u5B8C\u4E86\u306E\u304A\u77E5\u3089\u305B</div>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 16px;color:#111;font-size:15px">${name} \u69D8</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.8">
      \u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u78BA\u8A8D\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002<br>
      TAmJump develop \u3078\u3088\u3046\u3053\u305D\uFF01
    </p>
    <a href="https://develop.115en.com/login.html" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">\u30ED\u30B0\u30A4\u30F3\u3059\u308B</a>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;color:#aaa;font-size:11px">
    \u30BF\u30E0\u30B8\u682A\u5F0F\u4F1A\u793E / noreply@tamjump.com
  </div>
</div>
</body></html>`;
}
__name(emailWelcomeTemplate, "emailWelcomeTemplate");
function emailUpgradeTemplate(name) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#16a34a;padding:32px 40px">
    <div style="color:#fff;font-size:22px;font-weight:700">\u{1F389} \u6709\u6599\u30D7\u30E9\u30F3\u3078\u3088\u3046\u3053\u305D\uFF01</div>
    <div style="color:#d1fae5;font-size:13px;margin-top:4px">TAmJump develop</div>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 16px;color:#111;font-size:15px">${name} \u69D8</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.8">
      \u304A\u652F\u6255\u3044\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002\u6709\u6599\u30D7\u30E9\u30F3\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F\u3002<br>
      \u3059\u3079\u3066\u306E\u6A5F\u80FD\u3092\u3054\u5229\u7528\u3044\u305F\u3060\u3051\u307E\u3059\u3002
    </p>
    <a href="https://develop.115en.com/members/index.html" style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">\u4F1A\u54E1\u30DA\u30FC\u30B8\u3078</a>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;color:#aaa;font-size:11px">
    \u30BF\u30E0\u30B8\u682A\u5F0F\u4F1A\u793E / noreply@tamjump.com
  </div>
</div>
</body></html>`;
}
__name(emailUpgradeTemplate, "emailUpgradeTemplate");
function emailResetPasswordTemplate(name, resetUrl) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="background:#e8e8e8;padding:32px 40px">
    <div style="color:#111;font-size:22px;font-weight:700">\u30BF\u30E0\u30B8.develop</div>
    <div style="color:#666;font-size:13px;margin-top:4px">\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u518D\u8A2D\u5B9A</div>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 16px;color:#111;font-size:15px">${name} \u69D8</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.8">
      \u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u518D\u8A2D\u5B9A\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u53D7\u3051\u4ED8\u3051\u307E\u3057\u305F\u3002<br>
      \u4E0B\u306E\u30DC\u30BF\u30F3\u3092\u62BC\u3057\u3066\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u518D\u8A2D\u5B9A\u3059\u308B</a>
    <p style="margin:24px 0 0;color:#999;font-size:12px">
      \u3053\u306E\u30EA\u30F3\u30AF\u306F1\u6642\u9593\u6709\u52B9\u3067\u3059\u3002<br>
      \u5FC3\u5F53\u305F\u308A\u304C\u306A\u3044\u5834\u5408\u306F\u7121\u8996\u3057\u3066\u304F\u3060\u3055\u3044\u3002
    </p>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;color:#aaa;font-size:11px">
    \u30BF\u30E0\u30B8\u682A\u5F0F\u4F1A\u793E / noreply@tamjump.com
  </div>
</div>
</body></html>`;
}
__name(emailResetPasswordTemplate, "emailResetPasswordTemplate");
function emailSubscriptionExpiredTemplate(name) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="background:#e8e8e8;padding:32px 40px">
    <div style="color:#111;font-size:22px;font-weight:700">\u30BF\u30E0\u30B8.develop</div>
    <div style="color:#666;font-size:13px;margin-top:4px">Pro\u30D7\u30E9\u30F3\u306E\u6709\u52B9\u671F\u9650\u5207\u308C</div>
  </div>
  <div style="padding:40px">
    <p style="margin:0 0 16px;color:#111;font-size:15px">${name} \u69D8</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.8">
      Pro\u30D7\u30E9\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002<br>
      \u5F15\u304D\u7D9A\u304D\u3054\u5229\u7528\u3044\u305F\u3060\u304F\u306B\u306F\u3001\u518D\u5EA6\u304A\u652F\u6255\u3044\u304F\u3060\u3055\u3044\u3002
    </p>
    <a href="https://develop.115en.com/pricing.html" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">\u30D7\u30E9\u30F3\u3092\u66F4\u65B0\u3059\u308B</a>
    <p style="margin:24px 0 0;color:#999;font-size:12px">
      \u66F4\u65B0\u3055\u308C\u306A\u3044\u5834\u5408\u3001\u7121\u6599\u30D7\u30E9\u30F3\u306B\u81EA\u52D5\u7684\u306B\u79FB\u884C\u3055\u308C\u307E\u3059\u3002
    </p>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;color:#aaa;font-size:11px">
    \u30BF\u30E0\u30B8\u682A\u5F0F\u4F1A\u793E / noreply@tamjump.com
  </div>
</div>
</body></html>`;
}
__name(emailSubscriptionExpiredTemplate, "emailSubscriptionExpiredTemplate");
async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { email, password, name, turnstileToken } = body;
  if (env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return json({ error: "\u30DC\u30C3\u30C8\u78BA\u8A8D\u304C\u5FC5\u8981\u3067\u3059" }, 400, request);
    }
    const formData = new URLSearchParams();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", turnstileToken);
    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
    const tsData = await tsRes.json();
    if (!tsData.success) {
      return json({ error: "\u30DC\u30C3\u30C8\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" }, 400, request);
    }
  } else {
  }
  if (!email || !password || !name)
    return json({ error: "email, password, name \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 400, request);
  if (password.length < 8)
    return json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F8\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400, request);
  if (name.trim().length < 1)
    return json({ error: "\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400, request);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "\u3053\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u3059\u3067\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059" }, 409, request);
  const passwordHash = await hashPassword(password);
  const verifyToken = crypto.randomUUID();
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    `INSERT INTO users (email, password_hash, name, verify_token, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).bind(email, passwordHash, name.trim(), verifyToken).run();
  const workerOrigin = new URL(request.url).origin;
  const verifyUrl = `${workerOrigin}/api/auth/verify?token=${verifyToken}`;
  await sendEmail(env, email, "\u3010TAmJump develop\u3011\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044", emailVerifyTemplate(name, verifyUrl));
  return json({ ok: true, message: "\u78BA\u8A8D\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 201, request);
}
__name(handleRegister, "handleRegister");
async function handleVerify(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const baseUrl = env.BASE_URL || "https://develop.115en.com";
  if (!token) return redirect(`${baseUrl}/verified.html?error=1`);
  const user = await env.DB.prepare(
    "SELECT id, name, email FROM users WHERE verify_token = ? AND email_verified = 0"
  ).bind(token).first();
  if (!user) return redirect(`${baseUrl}/verified.html?error=1`);
  await env.DB.prepare(
    `UPDATE users SET email_verified = 1, verify_token = NULL, updated_at = datetime('now') WHERE id = ?`
  ).bind(user.id).run();
  await sendEmail(env, user.email, "\u3010TAmJump develop\u3011\u767B\u9332\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F", emailWelcomeTemplate(user.name));
  return redirect(`${baseUrl}/verified.html`);
}
__name(handleVerify, "handleVerify");
async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { email, password } = body;
  if (!email || !password) return json({ error: "email \u3068 password \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, email, name, password_hash, plan, email_verified FROM users WHERE email = ?"
  ).bind(email).first();
  if (!user || !await verifyPassword(password, user.password_hash))
    return json({ error: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 401, request);
  if (!user.email_verified)
    return json({ error: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u304C\u78BA\u8A8D\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u78BA\u8A8D\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", code: "EMAIL_NOT_VERIFIED" }, 403, request);
  const session = await createSession(env, user.id);
  const headers = {
    "Content-Type": "application/json",
    "Set-Cookie": sessionCookie(session.id, session.expiresAt),
    ...corsHeaders(request)
  };
  return new Response(JSON.stringify({
    ok: true,
    session_id: session.id,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
  }), { status: 200, headers });
}
__name(handleLogin, "handleLogin");
async function handleLogout(request, env) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  const headers = {
    "Content-Type": "application/json",
    "Set-Cookie": clearSessionCookie(),
    ...corsHeaders(request)
  };
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
__name(handleLogout, "handleLogout");
async function handleMe(request, env) {
  const sessionId = getSessionId(request);
  const session = await getSession(env, sessionId);
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401, request);
  return json({
    ok: true,
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      plan: session.plan,
      emailVerified: !!session.email_verified,
      proExpiresAt: session.pro_expires_at || null
    }
  }, 200, request);
}
__name(handleMe, "handleMe");
async function handleUpgrade(request, env) {
  if (env.SQUARE_WEBHOOK_SECRET) {
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";
    const rawBody = await request.text();
    const notificationUrl = "https://tamjump-member-api.animalb001.workers.dev/api/auth/upgrade";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(env.SQUARE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(notificationUrl + rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (signature !== expected) {
      console.error("Square signature mismatch");
      return json({ error: "Forbidden" }, 403, request);
    }
    const body2 = JSON.parse(rawBody);
    const eventType = body2.type;
    if (eventType === "payment.updated" || eventType === "invoice.payment_made") {
      const status = body2.data?.object?.payment?.status ?? body2.data?.object?.invoice?.status;
            const appId = body2.data?.object?.payment?.application_details?.application_id;
      if (appId && appId !== "sq0idp-gXjUpVLrPmQIBPLzE_nxGw") {
        return json({ ok: true, message: `ignored: app=${appId}` }, 200, request);
      }
      if (status !== "COMPLETED" && status !== "PAID") {
        return json({ ok: true, message: `ignored: status=${status}` }, 200, request);
      }
      const email2 = body2.data?.object?.payment?.buyer_email_address ?? body2.data?.object?.invoice?.primary_recipient?.email_address;
      if (!email2) return json({ error: "email \u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" }, 400, request);
      const user2 = await env.DB.prepare(
        "SELECT id, name, email FROM users WHERE email = ?"
      ).bind(email2).first();
      if (!user2) return json({ error: "\u4F1A\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404, request);
      const proExpiresAt2 = new Date(Date.now() + 35 * 24 * 60 * 60 * 1e3).toISOString();
      await env.DB.prepare(
        `UPDATE users SET plan = 'paid', pro_expires_at = ?, upgraded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).bind(proExpiresAt2, user2.id).run();
      await sendEmail(env, user2.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011\u6709\u6599\u30D7\u30E9\u30F3\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F", emailUpgradeTemplate(user2.name));
      return json({ ok: true, message: `${email2} \u3092\u6709\u6599\u30D7\u30E9\u30F3\u306B\u6607\u683C\u3057\u307E\u3057\u305F\uFF08\u671F\u9650: ${proExpiresAt2}\uFF09` }, 200, request);
    }
    if (eventType === "invoice.payment_failed") {
      const email2 = body2.data?.object?.invoice?.primary_recipient?.email_address;
      if (!email2) return json({ ok: true, message: "email \u306A\u3057\u30FB\u7121\u8996" }, 200, request);
      const user2 = await env.DB.prepare(
        "SELECT id, name, email FROM users WHERE email = ?"
      ).bind(email2).first();
      if (!user2) return json({ ok: true, message: "\u4F1A\u54E1\u306A\u3057\u30FB\u7121\u8996" }, 200, request);
      await env.DB.prepare(
        `UPDATE users SET plan = 'free', pro_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).bind(user2.id).run();
      await sendEmail(env, user2.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011\u304A\u652F\u6255\u3044\u306B\u5931\u6557\u3057\u307E\u3057\u305F", emailSubscriptionExpiredTemplate(user2.name));
      return json({ ok: true, message: `${email2} \u3092\u7121\u6599\u30D7\u30E9\u30F3\u306B\u623B\u3057\u307E\u3057\u305F` }, 200, request);
    }
    return json({ ok: true, message: `ignored: type=${eventType}` }, 200, request);
  }
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const adminToken = request.headers.get("X-Admin-Token");
  if (adminToken !== env.ADMIN_TOKEN) {
    return json({ error: "Forbidden" }, 403, request);
  }
  const email = body.email;
  if (!email) return json({ error: "email \u304C\u5FC5\u8981\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, name, email FROM users WHERE email = ?"
  ).bind(email).first();
  if (!user) return json({ error: "\u4F1A\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404, request);
  const proExpiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    `UPDATE users SET plan = 'paid', pro_expires_at = ?, upgraded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(proExpiresAt, user.id).run();
  await sendEmail(env, user.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011\u6709\u6599\u30D7\u30E9\u30F3\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F", emailUpgradeTemplate(user.name));
  return json({ ok: true, message: `${email} \u3092\u6709\u6599\u30D7\u30E9\u30F3\u306B\u6607\u683C\u3057\u307E\u3057\u305F` }, 200, request);
}
__name(handleUpgrade, "handleUpgrade");
async function handleResetPasswordRequest(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { email } = body;
  if (!email) return json({ error: "email \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, name FROM users WHERE email = ?"
  ).bind(email).first();
  if (!user) {
    return json({ ok: true, message: "\u30D1\u30B9\u30EF\u30FC\u30C9\u30EA\u30BB\u30C3\u30C8\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002\u30E1\u30FC\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002" }, 200, request);
  }
  const resetToken = crypto.randomUUID();
  const resetExpires = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    `UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(resetToken, resetExpires, user.id).run();
  const baseUrl = env.BASE_URL || "https://develop.115en.com";
  const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;
  await sendEmail(env, email, "\u3010TAmJump develop\u3011\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u518D\u8A2D\u5B9A", emailResetPasswordTemplate(user.name, resetUrl));
  return json({ ok: true, message: "\u30D1\u30B9\u30EF\u30FC\u30C9\u30EA\u30BB\u30C3\u30C8\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002\u30E1\u30FC\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002" }, 200, request);
}
__name(handleResetPasswordRequest, "handleResetPasswordRequest");
async function handleResetPasswordConfirm(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { token, password } = body;
  if (!token || !password) return json({ error: "token \u3068 password \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  if (password.length < 8) return json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F8\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400, request);
  const user = await env.DB.prepare(
    `SELECT id, name, email FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')`
  ).bind(token).first();
  if (!user) return json({ error: "\u30EA\u30F3\u30AF\u304C\u7121\u52B9\u307E\u305F\u306F\u671F\u9650\u5207\u308C\u3067\u3059\u3002\u518D\u5EA6\u30EA\u30BB\u30C3\u30C8\u3092\u7533\u8ACB\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 400, request);
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?`
  ).bind(passwordHash, user.id).run();
  return json({ ok: true, message: "\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, 200, request);
}
__name(handleResetPasswordConfirm, "handleResetPasswordConfirm");
async function handleUpdateProfile(request, env) {
  const sessionId = getSessionId(request);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "Unauthorized" }, 401, request);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { name } = body;
  if (!name || name.trim().length < 1) return json({ error: "\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400, request);
  await env.DB.prepare(
    `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(name.trim(), session.user_id).run();
  return json({ ok: true, message: "\u8868\u793A\u540D\u3092\u5909\u66F4\u3057\u307E\u3057\u305F" }, 200, request);
}
__name(handleUpdateProfile, "handleUpdateProfile");
async function handleUpdateEmail(request, env) {
  const sessionId = getSessionId(request);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "Unauthorized" }, 401, request);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { newEmail, password } = body;
  if (!newEmail || !password) return json({ error: "newEmail \u3068 password \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return json({ error: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE id = ?"
  ).bind(session.user_id).first();
  if (!user || !await verifyPassword(password, user.password_hash))
    return json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 401, request);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(newEmail).first();
  if (existing) return json({ error: "\u3053\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u3059\u3067\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059" }, 409, request);
  await env.DB.prepare(
    `UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newEmail, session.user_id).run();
  return json({ ok: true, message: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u5909\u66F4\u3057\u307E\u3057\u305F" }, 200, request);
}
__name(handleUpdateEmail, "handleUpdateEmail");
async function handleUpdatePassword(request, env) {
  const sessionId = getSessionId(request);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "Unauthorized" }, 401, request);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) return json({ error: "currentPassword \u3068 newPassword \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  if (newPassword.length < 8) return json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F8\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE id = ?"
  ).bind(session.user_id).first();
  if (!user || !await verifyPassword(currentPassword, user.password_hash))
    return json({ error: "\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" }, 401, request);
  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(passwordHash, session.user_id).run();
  return json({ ok: true, message: "\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5909\u66F4\u3057\u307E\u3057\u305F" }, 200, request);
}
__name(handleUpdatePassword, "handleUpdatePassword");
async function handleResendVerification(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { email } = body;
  if (!email) return json({ error: "email \u306F\u5FC5\u9808\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare(
    "SELECT id, name, email, email_verified FROM users WHERE email = ?"
  ).bind(email).first();
  if (!user || user.email_verified) {
    return json({ ok: true, message: "\u78BA\u8A8D\u30E1\u30FC\u30EB\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002\u30E1\u30FC\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002" }, 200, request);
  }
  const verifyToken = crypto.randomUUID();
  const baseUrl = env.BASE_URL || "https://develop.115en.com";
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${verifyToken}`;
  await env.DB.prepare(
    `UPDATE users SET verify_token = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(verifyToken, user.id).run();
  await sendEmail(env, user.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044", emailVerifyTemplate(user.name, verifyUrl));
  return json({ ok: true, message: "\u78BA\u8A8D\u30E1\u30FC\u30EB\u3092\u518D\u9001\u3057\u307E\u3057\u305F\u3002\u30E1\u30FC\u30EB\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002" }, 200, request);
}
__name(handleResendVerification, "handleResendVerification");
async function handleAdminGetUsers(request, env) {
  const adminToken = request.headers.get("X-Admin-Token");
  if (adminToken !== env.ADMIN_TOKEN) return json({ error: "Forbidden" }, 403, request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;
  const rows = await env.DB.prepare(
    `SELECT id, email, name, plan, email_verified, pro_expires_at, upgraded_at, updated_at
     FROM users ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  const count = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first();
  return json({ ok: true, users: rows.results, total: count.total, page, limit }, 200, request);
}
__name(handleAdminGetUsers, "handleAdminGetUsers");
async function handleAdminUpgrade(request, env) {
  const adminToken = request.headers.get("X-Admin-Token");
  if (adminToken !== env.ADMIN_TOKEN) return json({ error: "Forbidden" }, 403, request);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400, request);
  const { email, action } = body;
  if (!email) return json({ error: "email \u304C\u5FC5\u8981\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare("SELECT id, name, email FROM users WHERE email = ?").bind(email).first();
  if (!user) return json({ error: "\u4F1A\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404, request);
  if (action === "downgrade") {
    await env.DB.prepare(
      `UPDATE users SET plan = 'free', pro_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
    ).bind(user.id).run();
    return json({ ok: true, message: `${email} \u3092\u7121\u6599\u30D7\u30E9\u30F3\u306B\u5909\u66F4\u3057\u307E\u3057\u305F` }, 200, request);
  } else {
    const proExpiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1e3).toISOString();
    await env.DB.prepare(
      `UPDATE users SET plan = 'paid', pro_expires_at = ?, upgraded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).bind(proExpiresAt, user.id).run();
    await sendEmail(env, user.email, "\u3010\u30BF\u30E0\u30B8.Develop\u3011\u6709\u6599\u30D7\u30E9\u30F3\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F", emailUpgradeTemplate(user.name));
    return json({ ok: true, message: `${email} \u3092Pro\u30D7\u30E9\u30F3\u306B\u6607\u683C\u3057\u307E\u3057\u305F` }, 200, request);
  }
}
__name(handleAdminUpgrade, "handleAdminUpgrade");
async function handleAdminDeleteUser(request, env) {
  const adminToken = request.headers.get("X-Admin-Token");
  if (adminToken !== env.ADMIN_TOKEN) return json({ error: "Forbidden" }, 403, request);
  const body = await request.json().catch(() => null);
  if (!body?.email) return json({ error: "email \u304C\u5FC5\u8981\u3067\u3059" }, 400, request);
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(body.email).first();
  if (!user) return json({ error: "\u4F1A\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404, request);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
  return json({ ok: true, message: `${body.email} \u3092\u524A\u9664\u3057\u307E\u3057\u305F` }, 200, request);
}
__name(handleAdminDeleteUser, "handleAdminDeleteUser");
var index_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/auth/register" && request.method === "POST")
        return handleRegister(request, env);
      if (path === "/api/auth/verify" && request.method === "GET")
        return handleVerify(request, env);
      if (path === "/api/auth/login" && request.method === "POST")
        return handleLogin(request, env);
      if (path === "/api/auth/logout" && request.method === "POST")
        return handleLogout(request, env);
      if (path === "/api/auth/me" && request.method === "GET")
        return handleMe(request, env);
      if (path === "/api/auth/upgrade" && request.method === "POST")
        return handleUpgrade(request, env);
      if (path === "/api/auth/reset-password" && request.method === "POST")
        return handleResetPasswordRequest(request, env);
      if (path === "/api/auth/reset-password/confirm" && request.method === "POST")
        return handleResetPasswordConfirm(request, env);
      if (path === "/api/auth/update-profile" && request.method === "POST")
        return handleUpdateProfile(request, env);
      if (path === "/api/auth/update-email" && request.method === "POST")
        return handleUpdateEmail(request, env);
      if (path === "/api/auth/update-password" && request.method === "POST")
        return handleUpdatePassword(request, env);
      if (path === "/api/auth/resend-verification" && request.method === "POST")
        return handleResendVerification(request, env);
      if (path === "/api/admin/users" && request.method === "GET")
        return handleAdminGetUsers(request, env);
      if (path === "/api/admin/upgrade" && request.method === "POST")
        return handleAdminUpgrade(request, env);
      if (path === "/api/admin/user" && (request.method === "DELETE" || request.method === "POST"))
        return handleAdminDeleteUser(request, env);
      return json({ error: "Not found" }, 404, request);
    } catch (err) {
      console.error("Worker Error:", err);
      return json({ error: "Internal server error" }, 500, request);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
