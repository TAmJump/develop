/**
 * NDA の PDF 生成（pdf-lib）
 * - 本文は締結時の文面（ndaText）をそのまま組版
 * - 甲の欄は 記名 + 印影（D1 の nda_assets から読む。公開リポジトリには置かない）
 * - 乙の欄は 署名者名から電子印影を生成して押印
 * - 各ページ下部に 文書番号・ページ・本文ハッシュ（SHA-256）を印字
 * - 作成日時等のメタデータを締結日時に固定し、同じ入力から同じPDFを再生成できるようにする
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let FONT = null, IMG = {};
async function loadImg(env, name) {
  if (IMG[name]) return IMG[name];
  const r = await env.DB.prepare("SELECT b64 FROM nda_assets WHERE name=?").bind(name).first();
  if (!r) throw new Error("no_" + name);
  const bin = atob(r.b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  IMG[name] = u;
  return u;
}
async function loadFont(env) {
  if (FONT) return FONT;
  const url = env.NDA_FONT_URL || (env.SITE_URL || "https://develop.tamjump.com") + "/assets/fonts/nda-mincho.ttf";
  const cache = typeof caches !== "undefined" ? caches.default : null;
  let res = cache ? await cache.match(url) : null;
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error("font_fetch_" + res.status);
    if (cache) await cache.put(url, res.clone());
  }
  FONT = new Uint8Array(await res.arrayBuffer());
  return FONT;
}

const MM = 72 / 25.4;
const W = 210 * MM, H = 297 * MM;
const ML = 22 * MM, MR = 22 * MM, MT = 24 * MM, MB = 22 * MM;
const INK = rgb(0.1, 0.09, 0.08), FAINT = rgb(0.45, 0.42, 0.38), LINE = rgb(0.79, 0.74, 0.66);
const NO_HEAD = "、。，．）」』】〕・ー！？：；％";

const DASH = "‐‑‒–—―−ｰ-";
function fixGlyphs(font, text) {
  const set = new Set(font.getCharacterSet());
  let out = "";
  for (const c of text) {
    if (c === "\n" || set.has(c.codePointAt(0))) { out += c; continue; }
    if (DASH.includes(c)) out += set.has(0xff0d) ? "－" : "-";
    else out += set.has(0x3013) ? "〓" : "?";
  }
  return out;
}

function wrap(font, size, text, width) {
  const out = [];
  for (const para of text.split("\n")) {
    if (para === "") { out.push(""); continue; }
    let line = "", w = 0;
    const chars = [...para];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i], cw = font.widthOfTextAtSize(c, size);
      if (w + cw > width && line && !NO_HEAD.includes(c)) { out.push(line); line = ""; w = 0; }
      line += c; w += cw;
    }
    out.push(line);
  }
  return out;
}

// 乙の電子印影：署名者名（空白除く）を朱色の丸枠に縦書き。5字以上は2列
function drawStamp(page, font, name, x, cy) {
  const RED = rgb(0.78, 0.14, 0.14);
  const chars = [...String(name).replace(/[\s　]/g, "")].slice(0, 8);
  if (!chars.length) return;
  const d = 15 * MM, r = d / 2, cx = x + r;
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: RED, borderWidth: 1.4, opacity: 0, borderOpacity: 0.9 });
  const cols = chars.length > 4 ? [chars.slice(0, Math.ceil(chars.length / 2)), chars.slice(Math.ceil(chars.length / 2))] : [chars];
  const rows = Math.max(...cols.map((c) => c.length));
  const fs = Math.min((d * 0.72) / rows, (d * 0.62) / cols.length);
  const colW = fs * 1.05;
  cols.forEach((col, ci) => {
    const colX = cx + ((cols.length - 1) / 2 - ci) * colW - fs / 2;      // 右の列から読む
    const top = cy + (col.length * fs) / 2;
    col.forEach((ch, i) => {
      const w = font.widthOfTextAtSize(ch, fs);
      page.drawText(ch, { x: colX + (fs - w) / 2, y: top - (i + 1) * fs + fs * 0.12, size: fs, font, color: RED, opacity: 0.9 });
    });
  });
}

export async function buildNdaPdf(env, o) {
  // o: { text, doc_no, signed_at_jst, signed_at_iso, doc_hash, company }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadFont(env), { subset: true });
  const seal = await pdf.embedPng(await loadImg(env, "seal.png"));

  const when = new Date(o.signed_at_iso);
  pdf.setTitle(`秘密保持契約書 ${o.doc_no}`);
  pdf.setAuthor("タムジ株式会社");
  pdf.setSubject(`${o.company} との秘密保持契約`);
  pdf.setProducer("TAmJ NDA");
  pdf.setCreator("develop-api.tamjump.com");
  pdf.setCreationDate(when);
  pdf.setModificationDate(when);

  // 本文と署名欄を分離（「甲：」以降は署名欄として別組版）
  o = { ...o, text: fixGlyphs(font, o.text) };
  const cut = o.text.lastIndexOf("\n甲：");
  const body = cut > 0 ? o.text.slice(0, cut) : o.text;
  const sigBlock = cut > 0 ? o.text.slice(cut + 1) : "";
  const [title, ...rest] = body.split("\n");

  const size = 10.2, lh = size * 1.85, tw = W - ML - MR;
  const lines = wrap(font, size, rest.join("\n").replace(/^\n+/, ""), tw);

  const pages = [];
  let page = null, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - MT; };
  newPage();

  // 表題
  const ts = 17, tW = font.widthOfTextAtSize(title, ts);
  page.drawText(title, { x: (W - tW) / 2, y: y - ts, size: ts, font, color: INK });
  y -= ts + 16 * MM / 2.2;

  for (const ln of lines) {
    if (y - lh < MB + 10) newPage();
    const isHead = /^第\d+条/.test(ln);
    if (isHead) y -= size * 0.5;
    if (ln) page.drawText(ln, { x: ML, y: y - size, size, font, color: INK });
    y -= lh;
  }

  // 署名欄（1ページに収める）
  const need = 118 * MM / 1.6;
  if (y - need < MB) newPage();
  y -= 6 * MM;
  page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.6, color: LINE });
  y -= 7 * MM;

  const sl = sigBlock.split("\n");
  const kou = sl.filter((s) => s.startsWith("甲：") || (s.startsWith("　　") && sl.indexOf(s) < sl.findIndex((t) => t.startsWith("乙："))));
  const otsuStart = sl.findIndex((t) => t.startsWith("乙："));
  const metaStart = sl.findIndex((t) => t.startsWith("締結日時："));
  const otsu = sl.slice(otsuStart, metaStart);
  const meta = sl.slice(metaStart);

  // 甲
  const s2 = 10.5, l2 = s2 * 1.9;
  const kouTop = y;
  for (const ln of kou) { page.drawText(ln, { x: ML, y: y - s2, size: s2, font, color: INK }); y -= l2; }
  // 印影：甲の記名（代表取締役 大下 甚）の末尾に重ねて押印
  const nameLine = kou[kou.length - 1] || "";
  const nameEnd = ML + font.widthOfTextAtSize(nameLine, s2);
  const nameY = y + l2 - s2;
  const sd = 15 * MM;
  const sealY = nameY + s2 / 2 - sd / 2 - 2.5 * MM;      // 住所行に掛からないよう少し下げる
  page.drawImage(seal, { x: nameEnd - 1.5 * MM, y: sealY, width: sd, height: sd, opacity: 0.9 });
  y = Math.min(y, sealY - 1 * MM) - 5 * MM;

  // 乙
  let signLineEnd = 0, signLineY = 0;
  for (const ln of otsu) {
    page.drawText(ln, { x: ML, y: y - s2, size: s2, font, color: INK });
    if (ln.includes("署名：")) { signLineEnd = ML + font.widthOfTextAtSize(ln, s2); signLineY = y - s2; }
    y -= l2;
  }
  if (o.signer && signLineEnd) drawStamp(page, font, o.signer, signLineEnd + 2 * MM, signLineY + s2 / 2);
  y -= 4 * MM;
  page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.6, color: LINE });
  y -= 6 * MM;
  const s3 = 9.2, l3 = s3 * 1.9;
  for (const ln of meta) { page.drawText(ln, { x: ML, y: y - s3, size: s3, font, color: INK }); y -= l3; }
  const hashLine = `本文ハッシュ（SHA-256）：${o.doc_hash}`;
  for (const ln of wrap(font, 8, hashLine, tw)) { page.drawText(ln, { x: ML, y: y - 8, size: 8, font, color: FAINT }); y -= 8 * 1.8; }
  for (const ln of wrap(font, 8, "本書は電磁的方法により締結された契約書の原本であり、締結日時・本文ハッシュはタムジ株式会社のシステムに記録されている。", tw)) {
    page.drawText(ln, { x: ML, y: y - 8, size: 8, font, color: FAINT }); y -= 8 * 1.8;
  }

  // フッター
  const total = pages.length;
  pages.forEach((p, i) => {
    const f = `${o.doc_no}　${i + 1} / ${total}　SHA-256 ${o.doc_hash.slice(0, 16)}…`;
    p.drawLine({ start: { x: ML, y: MB - 6 }, end: { x: W - MR, y: MB - 6 }, thickness: 0.4, color: LINE });
    p.drawText(f, { x: ML, y: MB - 18, size: 7.5, font, color: FAINT });
    const r = "タムジ株式会社";
    p.drawText(r, { x: W - MR - font.widthOfTextAtSize(r, 7.5), y: MB - 18, size: 7.5, font, color: FAINT });
  });

  return await pdf.save({ useObjectStreams: false });
}

export function toB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
