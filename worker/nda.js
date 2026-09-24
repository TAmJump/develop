/**
 * NDA 自動締結 + 解除キー管理
 *
 * 公開API:
 *   GET  /api/nda/text?listing=        NDA本文（署名対象と同一の文面）
 *   POST /api/nda/request              申請 → 確認コード(6桁)をメール送信
 *   POST /api/nda/verify               確認コードの照合
 *   POST /api/nda/sign                 同意・署名 → 文書番号/ハッシュ/解除キー発行
 *   POST /api/nda/unlock               解除キー（または最高権限キー）→ 閲覧トークン
 *   POST /api/nda/check                閲覧トークンの有効確認（ページ読込ごと）
 *   POST /api/nda/renew/request        キー更新の確認コード送信
 *   POST /api/nda/renew                キー更新（旧キーは失効）
 * 管理API（管理ログイン必須）:
 *   GET  /admin/api/nda                締結一覧
 *   POST /admin/api/nda/revoke         {id} キー失効・NDA失効
 *   POST /admin/api/nda/issue          {company,person,email,listing} 手動発行（書面NDA締結済みの先方向け）
 *
 * Secret: MASTER_KEY（最高権限の解除キー。コードには書かない）, SESSION_SECRET（トークン署名）
 * 変数  : KEY_TTL_DAYS（解除キーの有効日数。既定 7）
 */

export const LISTINGS = {
  murakami: "村上3街区 複合ヘルスケア開発",
  nursing2: "医療対応型有料老人ホーム 2棟",
};
export const NDA_VERSION = "v1.0（2026-09-24）";

const TAMJ = {
  company: "タムジ株式会社",
  address: "東京都中央区東日本橋三丁目3番17号 Re-Know東日本橋4B",
  rep: "代表取締役 大下 甚",
};

export function ndaText(p, ttlDays) {
  const listing = LISTINGS[p.listing] || p.listing || "〔対象案件〕";
  const company = p.company || "〔相手方会社名〕";
  return `秘密保持契約書

${company}（以下「乙」という。）と${TAMJ.company}（以下「甲」という。）は、甲が紹介する開発案件への参画の検討に関し、次のとおり秘密保持契約（以下「本契約」という。）を締結する。

第1条（目的）
本契約は、「${listing}」（以下「本件案件」という。）における運営事業者としての参画の検討（以下「本目的」という。）のために、甲乙が相互に開示する情報の取扱いを定める。

第2条（秘密情報）
1. 秘密情報とは、本目的のために一方当事者（以下「開示者」という。）が相手方（以下「受領者」という。）に開示する一切の情報をいい、計画地の所在地・地番、土地所有者・開発事業者・施工会社・他の運営予定事業者の名称、図面、収支計画、賃料その他の条件を含む。開示の方法は、書面、電子メール、ウェブページの閲覧その他の電磁的方法を問わない。
2. 次の各号の情報は秘密情報に含まない。
(1) 開示時に既に公知であった情報
(2) 開示後、受領者の責めによらず公知となった情報
(3) 開示時に受領者が既に保有していた情報
(4) 正当な権限を有する第三者から秘密保持義務を負わずに取得した情報
(5) 秘密情報によらず独自に開発した情報

第3条（秘密保持義務）
1. 受領者は、開示者の事前の書面による承諾なく、秘密情報を第三者に開示し、又は漏えいしない。
2. 前項にかかわらず、受領者は、本目的のために必要な範囲で、自己の役員・従業員、弁護士・税理士・公認会計士その他の専門家及び金融機関に開示することができる。この場合、受領者は、開示先に本契約と同等の義務を負わせ、その遵守について責任を負う。
3. 法令、裁判所又は官公庁の命令により開示を求められた場合は、必要最小限の範囲で開示することができる。この場合、受領者は、可能な限り事前に開示者に通知する。

第4条（目的外使用の禁止）
受領者は、秘密情報を本目的以外に使用しない。

第5条（複製の制限）
受領者は、本目的に必要な範囲を超えて、秘密情報を複製、転載又は加工しない。

第6条（インターネット上での取扱い）
乙は、甲がウェブページ等の電磁的方法により開示する秘密情報について、次の各号を遵守する。
(1) 閲覧用のパスワード及び解除キーを、本目的のために閲覧を認められた者以外に開示せず、電子メール、チャット、SNSその他の方法で転送しない。
(2) 秘密情報を表示した画面の撮影、スクリーンショット、画面録画、印刷及び保存を行わない。ただし、甲が事前に承諾した場合を除く。
(3) 秘密情報を、SNS、ブログ、掲示板、共有ストレージ、生成AIサービス、翻訳サービスその他第三者がアクセスし得る外部サービスに入力、投稿又は保存しない。
(4) 公衆無線LAN等の安全性が確認できない通信環境、第三者と共用する端末及び第三者の目に触れる場所での閲覧を避ける。
(5) 閲覧に用いる端末及びアカウントを適切に管理し、不正アクセス、紛失又は盗難を防止する。
(6) 秘密情報の漏えい、又はそのおそれがあることを知った場合、直ちに甲に通知し、甲の指示に従って被害の拡大防止に必要な措置を講じる。

第7条（解除キーの管理）
1. 甲は、秘密情報の閲覧のため、乙に解除キーを発行する。解除キーの有効期間は発行日から${ttlDays}日間とし、乙は、有効期間の満了後も閲覧を継続する場合、甲所定の手続により解除キーの更新を受ける。
2. 甲は、解除キーによる閲覧の日時、接続元その他の記録を取得し、保存することができる。
3. 甲は、乙による本契約の違反又はそのおそれがあると判断した場合、本目的の検討が終了した場合、その他甲が必要と判断した場合、事前の通知なく解除キーを失効させることができる。

第8条（直接交渉の禁止）
乙は、本契約締結日から2年間、甲の事前の書面による承諾なく、本件案件に関し、土地所有者・開発事業者・施工会社その他甲から開示を受けた関係者と、直接又は第三者を介して交渉し、又は契約を締結しない。乙がこれに違反した場合、甲が本件案件において受領すべきであった報酬相当額を甲に支払う。

第9条（返還・破棄）
受領者は、開示者から請求があった場合又は本目的の検討を終了した場合、秘密情報（複製物を含む。）を遅滞なく返還又は破棄し、開示者の求めに応じて破棄を証する書面を提出する。電磁的記録については、復元できない方法で消去する。

第10条（損害賠償）
受領者は、本契約に違反して開示者に損害を与えた場合、その損害（合理的な弁護士費用を含む。）を賠償する。

第11条（有効期間）
本契約の有効期間は締結日から2年間とする。ただし、第3条から第6条まで及び第8条から第10条までの規定は、本契約終了後3年間存続する。

第12条（電子契約）
本契約は、電磁的方法による署名及び同意により成立する。甲が発行する電子文書を原本とし、甲乙はその効力を争わない。

第13条（準拠法・管轄）
本契約は日本法に準拠し、本契約に関する紛争は東京地方裁判所を第一審の専属的合意管轄裁判所とする。

第14条（協議）
本契約に定めのない事項は、甲乙誠実に協議のうえ解決する。

甲：${TAMJ.address}
　　${TAMJ.company}　${TAMJ.rep}
乙：${p.address || "〔所在地〕"}
　　${company}　${p.rep_name || "〔代表者名〕"}
　　担当：${p.person || "〔担当者〕"}${p.title ? "（" + p.title + "）" : ""}
　　署名：${p.signer || "〔署名〕"}
締結日時：${p.signed_at_jst || "〔締結時に自動付与〕"}
文書番号：${p.doc_no || "〔締結時に自動付与〕"}
文面版：${NDA_VERSION}`;
}

/* ---------- 共通 ---------- */
const enc = (s) => new TextEncoder().encode(s);
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function b64url(bytes) { let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDec(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc(data))));
}
function eqStr(a, b) { a = String(a || ""); b = String(b || ""); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function rand(n, alpha) { const a = alpha || "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (const x of crypto.getRandomValues(new Uint8Array(n))) s += a[x % a.length]; return s; }
function code6() { const x = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000; return String(x).padStart(6, "0"); }
function jst(d) {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}年${p(t.getUTCMonth() + 1)}月${p(t.getUTCDate())}日 ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}（日本時間）`;
}
function jstDate(iso) {
  const t = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
const ttlDays = (env) => Math.max(1, parseInt(env.KEY_TTL_DAYS || "7", 10) || 7);
const clip = (v, n) => String(v || "").trim().slice(0, n);
const okEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

async function log(env, req, kind, o) {
  try {
    await env.DB.prepare("INSERT INTO nda_log (at,kind,key_tail,nda_id,listing,ok,ip,ua) VALUES (?,?,?,?,?,?,?,?)")
      .bind(new Date().toISOString(), kind, o.key_tail || "", o.nda_id || "", o.listing || "", o.ok ? 1 : 0,
        req.headers.get("cf-connecting-ip") || "", (req.headers.get("user-agent") || "").slice(0, 200)).run();
  } catch (_) {}
}
async function tooManyFails(env, req) {
  const ip = req.headers.get("cf-connecting-ip") || "";
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM nda_log WHERE ip=? AND ok=0 AND at>? AND kind IN ('unlock','verify','renew')").bind(ip, since).first();
  return (r && r.n >= 10);
}

async function newCode(env, nda_id, purpose) {
  const c = code6();
  await env.DB.prepare("INSERT INTO nda_codes (nda_id,purpose,code_hash,expires_at,tries,used,created_at) VALUES (?,?,?,?,0,0,?)")
    .bind(nda_id, purpose, await sha256hex(nda_id + ":" + c), new Date(Date.now() + 15 * 60 * 1000).toISOString(), new Date().toISOString()).run();
  return c;
}
async function useCode(env, nda_id, purpose, c) {
  const row = await env.DB.prepare("SELECT * FROM nda_codes WHERE nda_id=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 1").bind(nda_id, purpose).first();
  if (!row) return "no_code";
  if (new Date(row.expires_at) < new Date()) return "expired";
  if (row.tries >= 5) return "locked";
  if (row.code_hash !== await sha256hex(nda_id + ":" + String(c || "").trim())) {
    await env.DB.prepare("UPDATE nda_codes SET tries=tries+1 WHERE id=?").bind(row.id).run();
    return "mismatch";
  }
  await env.DB.prepare("UPDATE nda_codes SET used=1 WHERE id=?").bind(row.id).run();
  return "ok";
}

async function issueKey(env, nda) {
  const key = "nda-" + rand(4) + "-" + rand(4) + "-" + rand(4);
  const now = new Date();
  const exp = new Date(now.getTime() + ttlDays(env) * 86400 * 1000);
  await env.DB.prepare("UPDATE nda_keys SET revoked=1 WHERE nda_id=? AND revoked=0").bind(nda.id).run();
  await env.DB.prepare("INSERT INTO nda_keys (key_hash,key_tail,nda_id,listing,email,issued_at,expires_at,revoked) VALUES (?,?,?,?,?,?,?,0)")
    .bind(await sha256hex(key), key.slice(-4), nda.id, nda.listing, nda.email, now.toISOString(), exp.toISOString()).run();
  return { key, expires_at: exp.toISOString() };
}

async function makeToken(env, o) {
  const p = b64url(enc(JSON.stringify(o)));
  return p + "." + await hmac(env.SESSION_SECRET, "nda:" + p);
}
async function readToken(env, t) {
  const i = String(t || "").indexOf("."); if (i < 0) return null;
  const p = t.slice(0, i), sig = t.slice(i + 1);
  if (!eqStr(sig, await hmac(env.SESSION_SECRET, "nda:" + p))) return null;
  try { return JSON.parse(new TextDecoder().decode(b64urlDec(p))); } catch { return null; }
}

/* ---------- メール ---------- */
function mailWrap(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;color:#1a1815">
<div style="max-width:600px;margin:0 auto;padding:28px 16px"><div style="background:#faf7f0;border:1px solid #c9bda8">
<div style="padding:22px 28px;border-bottom:1px solid #c9bda8;font-size:16px;font-weight:600">${title}</div>
<div style="padding:24px 28px;font-size:14px;line-height:1.9">${body}</div>
<div style="padding:16px 28px;border-top:1px solid #c9bda8;font-size:12px;color:#8a7c68">タムジ株式会社 ／ develop.tamjump.com ／ info@tamjump.com</div>
</div></div></body></html>`;
}
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------- ハンドラ ---------- */
export async function handleNda(req, env, path, m, json, sendMail) {
  if (!env.DB) return json({ error: "no_db" }, 500, req);
  const body = m === "POST" ? await req.json().catch(() => ({})) : {};
  const SITE = env.SITE_URL || "https://develop.tamjump.com";

  if (m === "GET" && path === "/api/nda/text") {
    const l = new URL(req.url).searchParams.get("listing") || "";
    if (!LISTINGS[l]) return json({ error: "bad_listing" }, 400, req);
    return json({ ok: true, version: NDA_VERSION, ttl_days: ttlDays(env), listing_name: LISTINGS[l], text: ndaText({ listing: l }, ttlDays(env)) }, 200, req);
  }

  /* 申請 */
  if (m === "POST" && path === "/api/nda/request") {
    if (String(body.hp || "").trim()) return json({ ok: true, id: "NA-IGNORED" }, 200, req);
    const r = {
      listing: clip(body.listing, 40), company: clip(body.company, 160), address: clip(body.address, 200),
      rep_name: clip(body.rep_name, 80), person: clip(body.person, 80), title: clip(body.title, 80),
      email: clip(body.email, 200).toLowerCase(), phone: clip(body.phone, 40),
    };
    if (!LISTINGS[r.listing]) return json({ error: "bad_listing" }, 422, req);
    if (!r.company || !r.address || !r.rep_name || !r.person || !r.email) return json({ error: "missing_fields" }, 422, req);
    if (!okEmail(r.email)) return json({ error: "invalid_email" }, 422, req);
    const id = "NA-" + rand(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO nda (id,listing,company,address,rep_name,person,title,email,phone,status,created_at,updated_at,ip,ua)
      VALUES (?,?,?,?,?,?,?,?,?,'申請',?,?,?,?)`).bind(id, r.listing, r.company, r.address, r.rep_name, r.person, r.title, r.email, r.phone, now, now,
      req.headers.get("cf-connecting-ip") || "", (req.headers.get("user-agent") || "").slice(0, 300)).run();
    const c = await newCode(env, id, "sign");
    const sent = await sendMail(env, {
      to: r.email, subject: `【タムジ株式会社】秘密保持契約の確認コード ${c}`,
      text: `${r.company} ${r.person} 様\n\n秘密保持契約の締結手続きの確認コードです。\n\n確認コード：${c}\n（有効期限15分）\n\n対象案件：${LISTINGS[r.listing]}\nお心当たりのない場合は、このメールを破棄してください。\n\nタムジ株式会社`,
      html: mailWrap("秘密保持契約の確認コード", `${esc(r.company)} ${esc(r.person)} 様<br><br>締結手続きの確認コードです。<div style="font-size:26px;letter-spacing:.3em;font-weight:700;margin:14px 0;color:#9b6339">${c}</div>有効期限は15分です。<br>対象案件：${esc(LISTINGS[r.listing])}<br><br><span style="color:#8a7c68;font-size:12px">お心当たりのない場合は、このメールを破棄してください。</span>`),
    });
    if (!sent) return json({ error: "mail_failed" }, 502, req);
    return json({ ok: true, id }, 200, req);
  }

  /* 確認コード照合 */
  if (m === "POST" && path === "/api/nda/verify") {
    if (await tooManyFails(env, req)) return json({ error: "too_many" }, 429, req);
    const id = clip(body.id, 20);
    const nda = await env.DB.prepare("SELECT * FROM nda WHERE id=?").bind(id).first();
    if (!nda || nda.status !== "申請") return json({ error: "not_found" }, 404, req);
    const r = await useCode(env, id, "sign", body.code);
    await log(env, req, "verify", { nda_id: id, listing: nda.listing, ok: r === "ok" });
    if (r !== "ok") return json({ error: r }, 400, req);
    await env.DB.prepare("UPDATE nda SET status='確認済',verified_at=?,updated_at=? WHERE id=?").bind(new Date().toISOString(), new Date().toISOString(), id).run();
    return json({ ok: true }, 200, req);
  }

  /* 署名・締結 */
  if (m === "POST" && path === "/api/nda/sign") {
    const id = clip(body.id, 20), signer = clip(body.signer, 80);
    if (!body.agree || !signer) return json({ error: "missing_fields" }, 422, req);
    const nda = await env.DB.prepare("SELECT * FROM nda WHERE id=?").bind(id).first();
    if (!nda || nda.status !== "確認済") return json({ error: "not_verified" }, 400, req);
    if (Date.now() - new Date(nda.verified_at).getTime() > 3600 * 1000) return json({ error: "verify_expired" }, 400, req);
    const now = new Date();
    const year = new Date(now.getTime() + 9 * 3600 * 1000).getUTCFullYear();
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM nda WHERE doc_no LIKE ?").bind(`NDA-${year}-%`).first();
    const doc_no = `NDA-${year}-${String((cnt ? cnt.n : 0) + 1).padStart(4, "0")}`;
    const signed_at_jst = jst(now);
    const text = ndaText({ ...nda, signer, signed_at_jst, doc_no }, ttlDays(env));
    const doc_hash = await sha256hex(text);
    await env.DB.prepare("UPDATE nda SET status='締結',signer=?,signed_at=?,doc_no=?,doc_hash=?,text_ver=?,updated_at=? WHERE id=?")
      .bind(signer, now.toISOString(), doc_no, doc_hash, NDA_VERSION, now.toISOString(), id).run();
    const k = await issueKey(env, nda);
    await log(env, req, "sign", { nda_id: id, listing: nda.listing, key_tail: k.key.slice(-4), ok: true });
    const pageUrl = `${SITE}/listings/${nda.listing}/`;
    const mailBody = `${nda.company} ${nda.person} 様\n\n秘密保持契約の締結が完了しました。\n\n文書番号：${doc_no}\n締結日時：${signed_at_jst}\n文書ハッシュ（SHA-256）：${doc_hash}\n\n解除キー：${k.key}\n有効期限：${jstDate(k.expires_at)}（日本時間）\n資料：${pageUrl}\n\n解除キーは第三者に転送しないでください。有効期限後は、資料ページの「解除キーを更新」から更新できます。\n\n―――― 締結した契約書 ――――\n${text}\n\n文書ハッシュ（SHA-256）：${doc_hash}`;
    await sendMail(env, {
      to: nda.email, reply_to: env.REPLY_TO || env.NOTIFY_TO || "info@tamjump.com",
      subject: `【タムジ株式会社】秘密保持契約の締結完了（${doc_no}）`, text: mailBody,
      html: mailWrap("秘密保持契約の締結完了", `${esc(nda.company)} ${esc(nda.person)} 様<br><br>秘密保持契約の締結が完了しました。<br><br>文書番号：${doc_no}<br>締結日時：${signed_at_jst}<br><span style="font-size:12px;word-break:break-all">文書ハッシュ（SHA-256）：${doc_hash}</span><div style="margin:18px 0;padding:14px 16px;border:1px solid #9b6339;background:#fff">解除キー：<b style="font-size:18px;letter-spacing:.06em">${k.key}</b><br>有効期限：${jstDate(k.expires_at)}（日本時間）</div>資料：<a href="${pageUrl}">${pageUrl}</a><br><br>解除キーは第三者に転送しないでください。有効期限後は、資料ページの「解除キーを更新」から更新できます。<pre style="white-space:pre-wrap;font-size:12px;line-height:1.8;background:#fff;border:1px solid #e4ded3;padding:14px;margin-top:20px">${esc(text)}</pre>`),
    });
    if (env.NOTIFY_TO) await sendMail(env, {
      to: env.NOTIFY_TO, subject: `[NDA締結] ${doc_no} ${nda.company}（${LISTINGS[nda.listing]}）`,
      text: `NDA締結\n文書番号：${doc_no}\n会社：${nda.company}\n代表者：${nda.rep_name}\n担当：${nda.person} ${nda.title || ""}\nメール：${nda.email}\n電話：${nda.phone || "-"}\n案件：${LISTINGS[nda.listing]}\n締結：${signed_at_jst}\n署名：${signer}\nハッシュ：${doc_hash}\nキー末尾：${k.key.slice(-4)}／期限 ${jstDate(k.expires_at)}\n\n管理画面：https://develop-api.tamjump.com/admin/nda\n\n${text}`,
    });
    return json({ ok: true, doc_no, signed_at: signed_at_jst, doc_hash, key: k.key, expires_at: k.expires_at }, 200, req);
  }

  /* 解除キー → 閲覧トークン */
  if (m === "POST" && path === "/api/nda/unlock") {
    if (!env.SESSION_SECRET) return json({ error: "not_configured" }, 500, req);
    const listing = clip(body.listing, 40), key = clip(body.key, 80);
    if (await tooManyFails(env, req)) return json({ error: "too_many" }, 429, req);
    if (env.MASTER_KEY && eqStr(key, env.MASTER_KEY)) {
      const exp = Date.now() + 30 * 86400 * 1000;
      await log(env, req, "unlock", { key_tail: "MSTR", listing, ok: true });
      return json({ ok: true, level: "master", expires_at: new Date(exp).toISOString(), token: await makeToken(env, { lv: "m", exp }) }, 200, req);
    }
    const row = await env.DB.prepare("SELECT k.*, n.company FROM nda_keys k LEFT JOIN nda n ON n.id=k.nda_id WHERE k.key_hash=?").bind(await sha256hex(key)).first();
    const bad = (e) => log(env, req, "unlock", { key_tail: key.slice(-4), nda_id: row ? row.nda_id : "", listing, ok: false }).then(() => json({ error: e }, 400, req));
    if (!row) return bad("invalid");
    if (row.revoked) return bad("revoked");
    if (new Date(row.expires_at) < new Date()) return bad("expired");
    if (row.listing !== listing) return bad("other_listing");
    await env.DB.prepare("UPDATE nda_keys SET last_used_at=? WHERE key_hash=?").bind(new Date().toISOString(), row.key_hash).run();
    await log(env, req, "unlock", { key_tail: row.key_tail, nda_id: row.nda_id, listing, ok: true });
    return json({ ok: true, level: "nda", company: row.company, expires_at: row.expires_at,
      token: await makeToken(env, { lv: "n", kh: row.key_hash, l: listing, exp: new Date(row.expires_at).getTime() }) }, 200, req);
  }

  /* 閲覧トークンの確認（ページ読込ごと） */
  if (m === "POST" && path === "/api/nda/check") {
    if (!env.SESSION_SECRET) return json({ error: "not_configured" }, 500, req);
    const t = await readToken(env, body.token), listing = clip(body.listing, 40);
    if (!t) return json({ error: "invalid" }, 400, req);
    if (Date.now() > t.exp) return json({ error: "expired" }, 400, req);
    if (t.lv === "m") return json({ ok: true, level: "master", expires_at: new Date(t.exp).toISOString() }, 200, req);
    if (t.l !== listing) return json({ error: "other_listing" }, 400, req);
    const row = await env.DB.prepare("SELECT k.*, n.company, n.status FROM nda_keys k LEFT JOIN nda n ON n.id=k.nda_id WHERE k.key_hash=?").bind(t.kh).first();
    if (!row || row.revoked || row.status === "失効") return json({ error: "revoked" }, 400, req);
    if (new Date(row.expires_at) < new Date()) return json({ error: "expired" }, 400, req);
    await env.DB.prepare("UPDATE nda_keys SET last_used_at=? WHERE key_hash=?").bind(new Date().toISOString(), row.key_hash).run();
    await log(env, req, "view", { key_tail: row.key_tail, nda_id: row.nda_id, listing, ok: true });
    return json({ ok: true, level: "nda", company: row.company, expires_at: row.expires_at }, 200, req);
  }

  /* 更新：確認コード送信（登録有無にかかわらず同じ応答） */
  if (m === "POST" && path === "/api/nda/renew/request") {
    const email = clip(body.email, 200).toLowerCase(), listing = clip(body.listing, 40);
    const nda = await env.DB.prepare("SELECT * FROM nda WHERE email=? AND listing=? AND status='締結' ORDER BY signed_at DESC LIMIT 1").bind(email, listing).first();
    if (nda) {
      const c = await newCode(env, nda.id, "renew");
      await sendMail(env, {
        to: email, subject: `【タムジ株式会社】解除キー更新の確認コード ${c}`,
        text: `${nda.company} ${nda.person} 様\n\n解除キー更新の確認コードです。\n\n確認コード：${c}\n（有効期限15分）\n\n対象案件：${LISTINGS[listing]}\n文書番号：${nda.doc_no}\n\nタムジ株式会社`,
        html: mailWrap("解除キー更新の確認コード", `${esc(nda.company)} ${esc(nda.person)} 様<br><br>解除キー更新の確認コードです。<div style="font-size:26px;letter-spacing:.3em;font-weight:700;margin:14px 0;color:#9b6339">${c}</div>有効期限は15分です。<br>対象案件：${esc(LISTINGS[listing])}<br>文書番号：${esc(nda.doc_no)}`),
      });
    }
    return json({ ok: true }, 200, req);
  }

  /* 更新：新キー発行（旧キーは失効） */
  if (m === "POST" && path === "/api/nda/renew") {
    if (await tooManyFails(env, req)) return json({ error: "too_many" }, 429, req);
    const email = clip(body.email, 200).toLowerCase(), listing = clip(body.listing, 40);
    const nda = await env.DB.prepare("SELECT * FROM nda WHERE email=? AND listing=? AND status='締結' ORDER BY signed_at DESC LIMIT 1").bind(email, listing).first();
    if (!nda) { await log(env, req, "renew", { listing, ok: false }); return json({ error: "mismatch" }, 400, req); }
    const r = await useCode(env, nda.id, "renew", body.code);
    await log(env, req, "renew", { nda_id: nda.id, listing, ok: r === "ok" });
    if (r !== "ok") return json({ error: r }, 400, req);
    const k = await issueKey(env, nda);
    await sendMail(env, {
      to: email, subject: `【タムジ株式会社】解除キーを更新しました（${nda.doc_no}）`,
      text: `${nda.company} ${nda.person} 様\n\n解除キーを更新しました。以前の解除キーは失効しています。\n\n解除キー：${k.key}\n有効期限：${jstDate(k.expires_at)}（日本時間）\n資料：${SITE}/listings/${listing}/\n\nタムジ株式会社`,
    });
    return json({ ok: true, key: k.key, expires_at: k.expires_at }, 200, req);
  }

  return json({ error: "not_found" }, 404, req);
}

/* ---------- 管理 ---------- */
export async function handleNdaAdmin(req, env, path, m, json, sendMail) {
  if (m === "GET" && path === "/admin/api/nda") {
    const r = await env.DB.prepare(`SELECT n.id,n.doc_no,n.listing,n.company,n.rep_name,n.person,n.title,n.email,n.phone,n.status,n.signer,n.signed_at,n.doc_hash,n.created_at,
      (SELECT key_tail FROM nda_keys k WHERE k.nda_id=n.id AND k.revoked=0 ORDER BY issued_at DESC LIMIT 1) AS key_tail,
      (SELECT expires_at FROM nda_keys k WHERE k.nda_id=n.id AND k.revoked=0 ORDER BY issued_at DESC LIMIT 1) AS key_exp,
      (SELECT MAX(at) FROM nda_log l WHERE l.nda_id=n.id AND l.ok=1 AND l.kind IN ('unlock','view')) AS last_view,
      (SELECT COUNT(*) FROM nda_log l WHERE l.nda_id=n.id AND l.ok=1 AND l.kind IN ('unlock','view')) AS views
      FROM nda n ORDER BY n.created_at DESC LIMIT 500`).all();
    return json({ ok: true, items: r.results || [], listings: LISTINGS }, 200, req);
  }
  if (m === "POST" && path === "/admin/api/nda/revoke") {
    const b = await req.json().catch(() => ({}));
    await env.DB.prepare("UPDATE nda_keys SET revoked=1 WHERE nda_id=?").bind(String(b.id || "")).run();
    await env.DB.prepare("UPDATE nda SET status='失効',updated_at=? WHERE id=?").bind(new Date().toISOString(), String(b.id || "")).run();
    return json({ ok: true }, 200, req);
  }
  if (m === "POST" && path === "/admin/api/nda/issue") {
    const b = await req.json().catch(() => ({}));
    const listing = clip(b.listing, 40), email = clip(b.email, 200).toLowerCase();
    if (!LISTINGS[listing] || !okEmail(email) || !clip(b.company, 160)) return json({ error: "missing_fields" }, 422, req);
    const id = "NA-" + rand(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO nda (id,doc_no,listing,company,address,rep_name,person,title,email,phone,status,signer,signed_at,text_ver,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'締結',?,?,?,?,?)`).bind(id, "書面締結", listing, clip(b.company, 160), clip(b.address, 200), clip(b.rep_name, 80),
      clip(b.person, 80), clip(b.title, 80), email, clip(b.phone, 40), "（管理画面から発行）", now, "書面", now, now).run();
    const k = await issueKey(env, { id, listing, email });
    if (b.send) await sendMail(env, {
      to: email, subject: `【タムジ株式会社】資料閲覧の解除キー（${LISTINGS[listing]}）`,
      text: `${clip(b.company, 160)} ${clip(b.person, 80)} 様\n\n資料閲覧の解除キーをお送りします。\n\n解除キー：${k.key}\n有効期限：${jstDate(k.expires_at)}（日本時間）\n資料：${env.SITE_URL || "https://develop.tamjump.com"}/listings/${listing}/\n\n解除キーは第三者に転送しないでください。有効期限後は、資料ページの「解除キーを更新」から更新できます。\n\nタムジ株式会社`,
    });
    return json({ ok: true, id, key: k.key, expires_at: k.expires_at }, 200, req);
  }
  return null;
}

export const NDA_ADMIN_HTML = (SITE) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>NDA管理</title>
<style>
body{margin:0;background:#f4efe6;color:#1a1815;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;font-size:14px;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:18px;margin:0 0 4px}.sub{color:#8a7c68;font-size:12.5px;margin:0 0 18px}
table{width:100%;border-collapse:collapse;background:#faf7f0;border:1px solid #c9bda8}
th,td{padding:9px 8px;border-bottom:1px solid #e4ded3;text-align:left;vertical-align:top;font-size:13px}
th{font-size:11.5px;color:#8a7c68;font-weight:600}
.b{display:inline-block;padding:1px 8px;border-radius:99px;border:1px solid #9b6339;color:#9b6339;font-size:11.5px}
.b.x{border-color:#b52d2d;color:#b52d2d}.b.o{border-color:#2e7d78;color:#2e7d78}
button{border:1px solid #9b6339;background:#fff;color:#9b6339;border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer}
button.p{background:#9b6339;color:#fff}
.box{border:1px solid #c9bda8;background:#faf7f0;padding:16px;margin:22px 0}
.box input,.box select{padding:7px 9px;border:1px solid #c9bda8;border-radius:5px;font-size:13px;margin:0 6px 8px 0}
.muted{color:#8a7c68}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.scroll{overflow-x:auto}
</style></head><body><div class="wrap">
<h1>NDA 締結一覧</h1><p class="sub">締結・解除キー・閲覧記録。<a href="/admin">お問い合わせ管理へ</a></p>
<div id="need" style="display:none">管理ログインが必要です。<a href="/admin">ログイン</a></div>
<div class="scroll"><table><thead><tr><th>文書番号</th><th>案件</th><th>会社／担当</th><th>メール</th><th>状況</th><th>締結日時</th><th>キー（末尾／期限）</th><th>閲覧</th><th></th></tr></thead><tbody id="list"></tbody></table></div>
<div class="box"><b>解除キーの手動発行</b><div class="muted" style="font-size:12.5px;margin:4px 0 10px">書面でNDAを締結済みの先方に、フォームを経ずにキーを発行する。</div>
<select id="i_l"></select><input id="i_c" placeholder="会社名"><input id="i_p" placeholder="担当者"><input id="i_e" placeholder="メール">
<label style="font-size:12.5px"><input type="checkbox" id="i_s" checked style="margin:0 4px 0 0">先方にメール送信</label>
<button class="p" id="i_b">発行する</button><div id="i_r" class="mono" style="margin-top:8px"></div></div>
</div><script>
var L={};function e(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function f(iso){if(!iso)return"-";var d=new Date(iso);return d.toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
async function load(){var r=await fetch("/admin/api/nda");if(r.status===401){document.getElementById("need").style.display="block";return;}
var j=await r.json();L=j.listings||{};var s=document.getElementById("i_l");s.innerHTML="";for(var k in L){var o=document.createElement("option");o.value=k;o.textContent=L[k];s.appendChild(o);}
var t=document.getElementById("list");t.innerHTML="";(j.items||[]).forEach(function(a){var exp=a.key_exp&&new Date(a.key_exp)<new Date();
var st=a.status==="失効"?'<span class="b x">失効</span>':a.status==="締結"?'<span class="b o">締結</span>':'<span class="b">'+e(a.status)+'</span>';
var tr=document.createElement("tr");tr.innerHTML="<td class='mono'>"+e(a.doc_no||a.id)+"</td><td>"+e(L[a.listing]||a.listing)+"</td><td>"+e(a.company)+"<br><span class='muted'>"+e(a.person)+" "+e(a.title||"")+"</span></td><td>"+e(a.email)+"<br><span class='muted'>"+e(a.phone||"")+"</span></td><td>"+st+"</td><td>"+f(a.signed_at)+"<br><span class='muted'>署名 "+e(a.signer||"-")+"</span></td><td class='mono'>"+(a.key_tail?("…"+e(a.key_tail)+"<br>"+(exp?"<span style='color:#b52d2d'>期限切れ</span> ":"")+f(a.key_exp)):"-")+"</td><td>"+(a.views||0)+"回<br><span class='muted'>"+f(a.last_view)+"</span></td><td>"+(a.status!=="失効"?"<button data-id='"+e(a.id)+"'>失効</button>":"")+"</td>";t.appendChild(tr);});
if(!(j.items||[]).length)t.innerHTML="<tr><td colspan='9' class='muted'>まだ申請はありません。</td></tr>";
t.querySelectorAll("button[data-id]").forEach(function(b){b.onclick=async function(){if(!confirm("この先方の解除キーを失効させます。よろしいですか。"))return;await fetch("/admin/api/nda/revoke",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.dataset.id})});load();};});}
document.getElementById("i_b").onclick=async function(){var r=await fetch("/admin/api/nda/issue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({listing:i_l.value,company:i_c.value,person:i_p.value,email:i_e.value,send:i_s.checked})});var j=await r.json();
document.getElementById("i_r").textContent=j.ok?("発行しました：解除キー "+j.key+"（期限 "+f(j.expires_at)+"）"):("発行できませんでした："+(j.error||r.status));if(j.ok)load();};
load();
</script></body></html>`;
