/**
 * 会員管理（tamjump_member_db を直接参照）
 *   GET  /admin/members            会員管理画面
 *   GET  /admin/api/members        会員一覧
 *   POST /admin/api/members/delete {id} 会員削除（セッションも削除）
 * Binding: MEMBER_DB（D1 tamjump_member_db）
 */
export async function handleMembersAdmin(req, env, path, m, json) {
  if (!env.MEMBER_DB) return json({ error: "no_member_db" }, 500, req);
  if (m === "GET" && path === "/admin/api/members") {
    const r = await env.MEMBER_DB.prepare("SELECT * FROM users ORDER BY rowid DESC LIMIT 2000").all();
    const items = (r.results || []).map((u) => {
      const o = { ...u };
      for (const k of Object.keys(o)) if (/password|token|secret/i.test(k)) delete o[k];
      return o;
    });
    return json({ ok: true, items }, 200, req);
  }
  if (m === "POST" && path === "/admin/api/members/delete") {
    const b = await req.json().catch(() => ({}));
    const id = String(b.id || "");
    if (!id) return json({ error: "bad_id" }, 400, req);
    for (const t of ["sessions", "session"]) {
      try { await env.MEMBER_DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(id).run(); } catch (_) {}
    }
    await env.MEMBER_DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();
    return json({ ok: true }, 200, req);
  }
  return null;
}

export const ADMIN_NAV = (cur) => `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
${[["/admin", "お問い合わせ", "inq"], ["/admin/nda", "NDA", "nda"], ["/admin/members", "会員", "mem"]]
  .map(([h, t, k]) => `<a href="${h}" style="text-decoration:none;font-size:13px;padding:8px 14px;border:1px solid ${k === cur ? "#9b6339" : "#c9bda8"};border-radius:4px;background:${k === cur ? "#9b6339" : "#fff"};color:${k === cur ? "#fff" : "#6e6354"}">${t}</a>`).join("")}
<a href="https://develop.tamjump.com/" style="text-decoration:none;font-size:13px;padding:8px 14px;border:1px solid #c9bda8;border-radius:4px;background:#fff;color:#6e6354">サイトを見る</a>
<button onclick="fetch('/admin/logout',{method:'POST'}).then(function(){location.href='/admin'})" style="font-size:13px;padding:8px 14px;border:1px solid #c9bda8;border-radius:4px;background:#fff;color:#6e6354;cursor:pointer">ログアウト</button></div>`;

export const MEMBERS_HTML = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>会員管理</title>
<style>
body{margin:0;background:#f4efe6;color:#1a1815;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;font-size:14px;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto;padding:24px 18px 60px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #c9bda8;padding-bottom:14px;margin-bottom:18px}
h1{font-size:18px;margin:0}
.stats{display:flex;gap:10px;margin:0 0 16px;flex-wrap:wrap}.stat{background:#faf7f0;border:1px solid #c9bda8;padding:10px 16px;min-width:120px}.stat b{display:block;font-size:22px}.stat span{font-size:12px;color:#8a7c68}
input{padding:8px 10px;border:1px solid #c9bda8;border-radius:5px;font-size:13px;width:260px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:#faf7f0;border:1px solid #c9bda8}
th,td{padding:9px 8px;border-bottom:1px solid #e4ded3;text-align:left;font-size:13px}
th{font-size:11.5px;color:#8a7c68;font-weight:600}
button.d{border:1px solid #b52d2d;background:#fff;color:#b52d2d;border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer}
.muted{color:#8a7c68}.scroll{overflow-x:auto}
</style></head><body><div class="wrap">
<div class="top"><h1>会員管理</h1>${ADMIN_NAV("mem")}</div>
<div id="need" style="display:none">管理ログインが必要です。<a href="/admin">ログイン</a></div>
<div class="stats"><div class="stat"><b id="n_all">-</b><span>総会員数</span></div><div class="stat"><b id="n_ok">-</b><span>メール認証済み</span></div><div class="stat"><b id="n_ng">-</b><span>メール未認証</span></div></div>
<input id="q" placeholder="名前・メールで絞り込み">
<div class="scroll"><table><thead><tr><th>名前</th><th>メールアドレス</th><th>メール認証</th><th>登録日時</th><th></th></tr></thead><tbody id="list"></tbody></table></div>
</div><script>
var ALL=[];function e(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function f(v){if(!v)return"-";var d=new Date(typeof v==="number"&&v<1e12?v*1000:v);return isNaN(d)?e(v):d.toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
function render(){var q=document.getElementById("q").value.trim().toLowerCase();var t=document.getElementById("list");t.innerHTML="";
ALL.filter(function(u){return !q||(String(u.name||"")+" "+String(u.email||"")).toLowerCase().indexOf(q)>=0;}).forEach(function(u){
var tr=document.createElement("tr");tr.innerHTML="<td>"+e(u.name||"-")+"</td><td>"+e(u.email)+"</td><td>"+(u.email_verified?"済":"<span class='muted'>未</span>")+"</td><td>"+f(u.created_at||u.createdAt)+"</td><td><button class='d' data-id='"+e(u.id)+"' data-em='"+e(u.email)+"'>削除</button></td>";t.appendChild(tr);});
if(!t.children.length)t.innerHTML="<tr><td colspan='5' class='muted'>該当する会員はいません。</td></tr>";
t.querySelectorAll("button.d").forEach(function(b){b.onclick=async function(){if(!confirm(b.dataset.em+" を削除します。よろしいですか。"))return;await fetch("/admin/api/members/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.dataset.id})});load();};});}
async function load(){var r=await fetch("/admin/api/members");if(r.status===401){document.getElementById("need").style.display="block";return;}var j=await r.json();ALL=j.items||[];
document.getElementById("n_all").textContent=ALL.length;var ok=ALL.filter(function(u){return u.email_verified;}).length;document.getElementById("n_ok").textContent=ok;document.getElementById("n_ng").textContent=ALL.length-ok;render();}
document.getElementById("q").oninput=render;load();
</script></body></html>`;
