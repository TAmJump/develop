/**
 * TAmJ 不動産開発 受付 + 管理 Worker
 * Custom Domain: develop-api.tamjump.com
 *
 * 公開:
 *   GET  /health
 *   POST /api/inquiry           お問い合わせ受付（D1保存・通知/自動返信メール）
 * 管理（パスワードログイン）:
 *   GET  /admin                 管理画面
 *   POST /admin/login           {user,password} → 署名Cookie
 *   POST /admin/logout
 *   GET  /admin/api/me
 *   GET  /admin/api/list
 *   GET  /admin/api/item?id=
 *   POST /admin/api/status      {id,status}
 *   POST /admin/api/note        {id,note}
 *
 * 必須Secret: RESEND_API_KEY, NOTIFY_TO, ADMIN_PASSWORD, SESSION_SECRET
 * 任意Secret: ADMIN_USER, REPLY_TO
 * 必須Binding: DB (D1 "develop")  /  変数: FROM_EMAIL, SITE_URL
 */

const SELF = "https://develop-api.tamjump.com";
const SITE = "https://develop.tamjump.com";
const STATUSES = ["新規","連絡済","対応中","完了","見送り"];
const KINDS = ["用地を売りたい","用地を購入・開発したい","開発・事業性の相談","M&A・事業承継","その他"];

function cors(req){
  const o=req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": o||"*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const json=(obj,status,req)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(req)}});
const page=(s,status=200)=>new Response(s,{status,headers:{"Content-Type":"text/html; charset=utf-8"}});

function genId(){ const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; const r=crypto.getRandomValues(new Uint8Array(6)); for(const x of r) s+=a[x%a.length]; return "DV-"+s; }

function b64url(bytes){ let bin=""; for(const b of bytes) bin+=String.fromCharCode(b); return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function b64urlDec(s){ s=s.replace(/-/g,"+").replace(/_/g,"/"); const bin=atob(s); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
async function hmac(secret,data){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}
async function makeSession(env){
  const payload=b64url(new TextEncoder().encode(JSON.stringify({exp:Date.now()+12*3600*1000})));
  return payload+"."+await hmac(env.SESSION_SECRET,payload);
}
async function verifySession(env,val){
  if(!val||!env.SESSION_SECRET) return false;
  const i=val.indexOf("."); if(i<0) return false;
  const p=val.slice(0,i), sig=val.slice(i+1);
  if(sig!==await hmac(env.SESSION_SECRET,p)) return false;
  try{ const o=JSON.parse(new TextDecoder().decode(b64urlDec(p))); return Date.now()<o.exp; }catch{ return false; }
}
function getCookie(req,name){
  const c=req.headers.get("Cookie")||""; const m=c.match(new RegExp("(?:^|; )"+name+"=([^;]+)")); return m?decodeURIComponent(m[1]):"";
}
function eqStr(a,b){ a=String(a||""); b=String(b||""); if(a.length!==b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }

async function sendMail(env,o){
  if(!env.RESEND_API_KEY) return false;
  try{
    const body={from:env.FROM_EMAIL||"TAmJ不動産開発 <noreply@tamjump.com>",to:o.to,subject:o.subject,text:o.text};
    if(o.reply_to) body.reply_to=o.reply_to;
    const r=await fetch("https://api.resend.com/emails",{method:"POST",
      headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify(body)});
    return r.ok;
  }catch{ return false; }
}

export default {
  async fetch(req, env){
    const url=new URL(req.url), path=url.pathname, m=req.method;
    if(m==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});

    if(m==="GET" && (path==="/"||path==="/health"))
      return json({ok:true,service:"develop-api",resend:!!env.RESEND_API_KEY,notify:!!env.NOTIFY_TO,d1:!!env.DB,admin:!!(env.ADMIN_PASSWORD&&env.SESSION_SECRET),ts:new Date().toISOString()},200,req);

    if(m==="POST" && (path==="/api/inquiry"||path==="/inquiry")) return handleInquiry(req,env);

    if(m==="GET" && path==="/admin") return page(ADMIN_HTML);
    if(m==="POST" && path==="/admin/login") return adminLogin(req,env);
    if(m==="POST" && path==="/admin/logout") return adminLogout(req,env);
    if(path.startsWith("/admin/api/")) return adminApi(req,env,path,m);

    return json({error:"not_found"},404,req);
  },
};

/* ===================== 受付 ===================== */
async function handleInquiry(req,env){
  let b; try{ b=await req.json(); }catch{ return json({error:"invalid_json"},400,req); }
  // ハニーポット（botは hp に入力しがち）
  if(String(b.hp||"").trim()!=="") return json({ok:true,id:"DV-IGNORED"},200,req);

  const name=String(b.name||"").trim(), email=String(b.email||"").trim(),
        message=String(b.message||"").trim();
  if(!name||!email||!message) return json({error:"missing_fields"},422,req);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({error:"invalid_email"},422,req);
  if(name.length>120||email.length>200||message.length>5000) return json({error:"too_long"},422,req);

  const kind=KINDS.includes(b.kind)?b.kind:"その他";
  const now=new Date().toISOString();
  const row={
    id:genId(), name, email,
    phone:String(b.phone||"").trim().slice(0,40),
    company:String(b.company||"").trim().slice(0,160),
    kind, region:String(b.region||"").trim().slice(0,120),
    budget:String(b.budget||"").trim().slice(0,120),
    message, status:"新規", admin_note:"",
    created_at:now, updated_at:now,
    ua:(req.headers.get("user-agent")||"").slice(0,300), ip:req.headers.get("cf-connecting-ip")||"",
  };

  let stored=false;
  if(env.DB){
    try{
      await env.DB.prepare(
        `INSERT INTO inquiries (id,name,email,phone,company,kind,region,budget,message,status,admin_note,created_at,updated_at,ua,ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(row.id,row.name,row.email,row.phone,row.company,row.kind,row.region,row.budget,row.message,row.status,row.admin_note,row.created_at,row.updated_at,row.ua,row.ip).run();
      stored=true;
    }catch(_){}
  }

  // 管理者通知（自社の受信箱なので内容を含める）
  let notified=false;
  if(env.NOTIFY_TO){
    notified=await sendMail(env,{
      to:env.NOTIFY_TO,
      reply_to:email,
      subject:`[TAmJ開発用地] 新規お問い合わせ ${row.id}（${kind}）`,
      text:
`新しいお問い合わせを受け付けました。

受付番号：${row.id}
受付日時：${row.created_at}
ご相談種別：${kind}

お名前：${name}
メール：${email}
電話：${row.phone||"-"}
会社名：${row.company||"-"}
エリア：${row.region||"-"}
予算・規模：${row.budget||"-"}

ご相談内容：
${message}

──────────
管理画面：${SELF}/admin`,
    });
  }

  // 自動返信（お問い合わせ者へ・返信先 info）
  if(env.RESEND_API_KEY){
    await sendMail(env,{
      to:email,
      reply_to: env.REPLY_TO || env.NOTIFY_TO || "info@tamjump.com",
      subject:"【TAmJ｜不動産開発】お問い合わせを受け付けました",
      text:
`${name} 様

このたびはお問い合わせをいただき、誠にありがとうございます。
タムジ株式会社 不動産開発 担当の大下と申します。

下記の内容で、確かに受け付けいたしました。
内容を確認のうえ、担当より追ってご連絡いたします。

──────────
受付番号：${row.id}
ご相談種別：${kind}
${row.region?`エリア：${row.region}\n`:""}${row.budget?`予算・規模：${row.budget}\n`:""}
ご相談内容：
${message}
──────────

※本メールは送信専用です。ご返信いただく場合は、このメールにそのままご返信ください（info@tamjump.com 宛に届きます）。

土地の売却・取得から、開発費の概算、出口の設計まで。
ご構想に合わせて、最適なご提案をさせていただきます。

大下 甚（おおした じん）
タムジ株式会社 ／ 不動産開発
${SITE}`,
    });
  }

  if(!stored && !notified) return json({error:"no_sink"},502,req);
  return json({ok:true,id:row.id,stored,notified},200,req);
}

/* ===================== 管理 ===================== */
async function adminLogin(req,env){
  let b; try{ b=await req.json(); }catch{ return json({error:"invalid_json"},400,req); }
  if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET) return json({error:"not_configured"},500,req);
  const okUser = !env.ADMIN_USER || eqStr(b.user, env.ADMIN_USER);
  const okPw   = eqStr(b.password, env.ADMIN_PASSWORD);
  if(!okUser||!okPw) return json({error:"unauthorized"},401,req);
  const s=await makeSession(env);
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{
    "Content-Type":"application/json",
    "Set-Cookie":`dv_admin=${s}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=43200`,
  }});
}
function adminLogout(){
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{
    "Content-Type":"application/json",
    "Set-Cookie":"dv_admin=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0",
  }});
}
async function adminApi(req,env,path,m){
  const authed=await verifySession(env,getCookie(req,"dv_admin"));
  if(path==="/admin/api/me") return json({auth:authed},200,req);
  if(!authed) return json({error:"unauthorized"},401,req);
  if(!env.DB) return json({error:"no_db"},500,req);

  if(m==="GET" && path==="/admin/api/list"){
    const r=await env.DB.prepare("SELECT id,name,company,kind,region,status,created_at FROM inquiries ORDER BY created_at DESC LIMIT 500").all();
    return json({ok:true,items:r.results||[]},200,req);
  }
  if(m==="GET" && path==="/admin/api/item"){
    const id=new URL(req.url).searchParams.get("id")||"";
    const a=await env.DB.prepare("SELECT * FROM inquiries WHERE id=?").bind(id).first();
    if(!a) return json({error:"not_found"},404,req);
    return json({ok:true,item:a},200,req);
  }
  if(m==="POST" && path==="/admin/api/status"){
    const b=await req.json().catch(()=>({}));
    if(!STATUSES.includes(b.status)) return json({error:"bad_status"},400,req);
    await env.DB.prepare("UPDATE inquiries SET status=?,updated_at=? WHERE id=?").bind(b.status,new Date().toISOString(),String(b.id||"")).run();
    return json({ok:true},200,req);
  }
  if(m==="POST" && path==="/admin/api/note"){
    const b=await req.json().catch(()=>({}));
    await env.DB.prepare("UPDATE inquiries SET admin_note=?,updated_at=? WHERE id=?").bind(String(b.note||""),new Date().toISOString(),String(b.id||"")).run();
    return json({ok:true},200,req);
  }
  return json({error:"not_found"},404,req);
}

/* ===================== 管理画面HTML ===================== */
const PAGE_CSS = `
:root{--paper:#fff;--ink:#1A1815;--ink-2:#2B2823;--ink-soft:#6E6354;--ink-faint:#938D82;--accent:#8A7C68;--accent-deep:#6E6354;--line:rgba(26,24,21,.12);--line-strong:rgba(26,24,21,.2)}
*{box-sizing:border-box}
body{margin:0;background:#F5F2EC;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent-deep)}
.wrap{max-width:1040px;margin:0 auto;padding:26px 20px 60px}
.top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:22px}
.brand{font-weight:700;font-size:18px;letter-spacing:.02em}.brand em{font-style:normal;color:var(--accent)}
h1{font-size:18px;margin:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:600;background:var(--ink);color:#fff;border:0;border-radius:3px;padding:11px 18px;cursor:pointer;transition:.2s}
.btn:hover{background:var(--ink-2)}
.btn.ghost{background:#fff;color:var(--ink-soft);border:1px solid var(--line-strong)}
.btn.ghost:hover{color:var(--ink);background:#faf8f4}
input,select,textarea{width:100%;font:inherit;color:var(--ink);background:#fff;border:1px solid var(--line-strong);border-radius:3px;padding:11px 12px;transition:.2s}
textarea{resize:vertical;min-height:80px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(138,124,104,.16)}
.muted{color:var(--ink-faint)}
.badge{display:inline-block;font-size:12px;padding:3px 9px;border:1px solid var(--accent);color:var(--accent-deep);border-radius:99px;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:14px;background:#fff}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--ink-faint);font-weight:600;letter-spacing:.04em}
tbody tr{cursor:pointer}tbody tr:hover{background:#faf8f4}
.grid{display:grid;grid-template-columns:1.3fr 1fr;gap:26px;align-items:start}
@media(max-width:820px){.grid{grid-template-columns:1fr}}
.card{border:1px solid var(--line-strong);border-radius:4px;padding:20px;background:#fff}
.row{display:flex;gap:14px;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}
.row:last-child{border-bottom:0}.row .k{flex:0 0 92px;color:var(--ink-faint);font-size:13px}.row .v{flex:1;word-break:break-word;white-space:pre-wrap}
.sec{font-size:12px;color:var(--ink-faint);letter-spacing:.08em;text-transform:uppercase;margin:22px 0 8px}
.center{max-width:420px;margin:60px auto;text-align:center}
.err{color:#9b4a3a;font-size:13px;min-height:18px;margin-top:8px}
`;

const ADMIN_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>不動産開発 お問い合わせ管理</title><style>${PAGE_CSS}</style></head><body>
<div class="wrap">
  <div class="top"><span class="brand">TAmJ<em>／</em>不動産開発 管理</span><div style="display:flex;gap:8px;align-items:center"><a class="btn ghost" href="${SITE}/" style="text-decoration:none">← サイトを見る</a><button class="btn ghost" id="logout" style="display:none">ログアウト</button></div></div>

  <div id="login" style="display:none">
    <div class="center">
      <h1 style="margin-bottom:18px">管理ログイン</h1>
      <form id="loginForm">
        <input id="uid" type="text" placeholder="ID" autocomplete="username" style="margin-bottom:10px" />
        <input id="pw" type="password" placeholder="パスワード" autocomplete="current-password" autofocus />
        <div class="err" id="loginErr"></div>
        <button class="btn" style="width:100%;margin-top:6px">ログイン</button>
      </form>
    </div>
  </div>

  <div id="app" style="display:none">
    <div class="grid">
      <div>
        <div class="sec">お問い合わせ一覧</div>
        <table><thead><tr><th>受付</th><th>お名前</th><th>種別</th><th>エリア</th><th>状況</th></tr></thead><tbody id="list"></tbody></table>
      </div>
      <div>
        <div class="sec">詳細</div>
        <div id="panel" class="card" style="display:none">
          <div id="detail"></div>
          <div class="sec">状況</div>
          <select id="statusSel"></select>
          <div class="sec">社内メモ</div>
          <textarea id="note" placeholder="社内メモ（お問い合わせ者には表示されません）"></textarea>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn ghost" id="saveNote">メモを保存</button><span class="muted" id="noteMsg" style="font-size:13px"></span></div>
        </div>
        <div id="empty" class="muted" style="font-size:14px">左の一覧から選択してください。</div>
      </div>
    </div>
  </div>
</div>
<script>
var S=["新規","連絡済","対応中","完了","見送り"];var cur=null;
function el(id){return document.getElementById(id);}
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function fmt(iso){try{return new Date(iso).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch(e){return iso;}}
async function me(){var r=await fetch("/admin/api/me");return (await r.json()).auth;}
function show(v){el("login").style.display=v==="login"?"block":"none";el("app").style.display=v==="app"?"block":"none";el("logout").style.display=v==="app"?"inline-flex":"none";}
async function boot(){ if(await me()){show("app");loadList();} else show("login"); }
el("loginForm").onsubmit=async function(e){e.preventDefault();el("loginErr").textContent="";var r=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:el("uid").value,password:el("pw").value})});if(r.ok){show("app");loadList();}else{el("loginErr").textContent="IDまたはパスワードが違います。";}};
el("logout").onclick=async function(){await fetch("/admin/logout",{method:"POST"});location.reload();};
async function loadList(){var r=await fetch("/admin/api/list");if(r.status===401){show("login");return;}var j=await r.json();var t=el("list");t.innerHTML="";(j.items||[]).forEach(function(a){var tr=document.createElement("tr");tr.innerHTML="<td>"+fmt(a.created_at)+"</td><td>"+esc(a.name)+"</td><td>"+esc(a.kind||"-")+"</td><td>"+esc(a.region||"-")+"</td><td><span class='badge'>"+esc(a.status)+"</span></td>";tr.onclick=function(){openItem(a.id);};t.appendChild(tr);});if(!(j.items||[]).length)t.innerHTML="<tr><td colspan='5' class='muted'>まだお問い合わせはありません。</td></tr>";}
function rowHtml(k,v){return "<div class='row'><span class='k'>"+k+"</span><span class='v'>"+v+"</span></div>";}
async function openItem(id){var r=await fetch("/admin/api/item?id="+encodeURIComponent(id));if(!r.ok)return;var j=await r.json();var a=j.item;cur=id;el("empty").style.display="none";el("panel").style.display="block";
 var h="";
 h+=rowHtml("受付",esc(a.id));
 h+=rowHtml("お名前",esc(a.name));
 h+=rowHtml("メール","<a href='mailto:"+esc(a.email)+"'>"+esc(a.email)+"</a>");
 h+=rowHtml("電話",a.phone?"<a href='tel:"+esc(a.phone)+"'>"+esc(a.phone)+"</a>":"-");
 h+=rowHtml("会社名",esc(a.company||"-"));
 h+=rowHtml("種別",esc(a.kind||"-"));
 h+=rowHtml("エリア",esc(a.region||"-"));
 h+=rowHtml("予算・規模",esc(a.budget||"-"));
 h+=rowHtml("ご相談内容",esc(a.message||"-"));
 h+=rowHtml("受付日時",fmt(a.created_at));
 el("detail").innerHTML=h;
 var sel=el("statusSel");sel.innerHTML="";S.forEach(function(s){var o=document.createElement("option");o.textContent=s;if(s===a.status)o.selected=true;sel.appendChild(o);});
 el("note").value=a.admin_note||"";el("noteMsg").textContent="";
}
el("statusSel").onchange=async function(){if(!cur)return;await fetch("/admin/api/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:cur,status:this.value})});loadList();};
el("saveNote").onclick=async function(){if(!cur)return;await fetch("/admin/api/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:cur,note:el("note").value})});el("noteMsg").textContent="保存しました";setTimeout(function(){el("noteMsg").textContent="";},1500);};
boot();
</script>
</body></html>`;
