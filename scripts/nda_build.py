#!/usr/bin/env python3
"""
案件ページのビルド（公開版＝ノンネーム／完全版＝暗号化）

  CONTENT_SECRET=... python3 scripts/nda_build.py build  <ソースdir> [案件ID...]
  CONTENT_SECRET=... python3 scripts/nda_build.py decrypt <案件ID> <出力ファイル>

ソースdir（公開リポジトリには置かない）:
  <ID>.html         完全版のソース（伏せる部分を含む）。<body>直後に <script src="../lock.js" data-l="ID"></script>
  <ID>.public.html  （任意）公開版を手書きする場合。無ければ完全版から自動生成

完全版から公開版を作るときの規則:
  - class="nda-only" の要素を削除
  - class="admin-only" の要素は、NDA締結先の完全版からも削除（当社の最高権限でのみ表示。master.enc に格納）
  - ページ内CSSの「body.nonname セレクタ{display:none}」に該当する要素を削除
  - class="conf" の中身を「■■■■」に置換
  - 削除した要素のidを参照するインラインscriptを削除（地図の座標など）
  - 最後に、伏せ字の元の語句が公開版に残っていないか検査（残っていれば中止）

暗号化: AES-256-GCM（鍵 = HMAC-SHA256(CONTENT_SECRET, "ck:"+ID)）、本文は gzip 後に暗号化。
出力: listings/<ID>/index.html（公開版）と listings/<ID>/full.enc（12byte IV + 暗号文）
"""
import base64, gzip, hashlib, hmac, os, re, sys
from bs4 import BeautifulSoup, Comment
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASK = "■■■■"


def ckey(listing):
    sec = os.environ.get("CONTENT_SECRET", "")
    if not sec:
        sys.exit("CONTENT_SECRET が未設定")
    return hmac.new(sec.encode(), ("ck:" + listing).encode(), hashlib.sha256).digest()


def encrypt(listing, html):
    iv = os.urandom(12)
    data = gzip.compress(html.encode("utf-8"), mtime=0)
    return iv + AESGCM(ckey(listing)).encrypt(iv, data, None)


def decrypt(listing, blob):
    return gzip.decompress(AESGCM(ckey(listing)).decrypt(blob[:12], blob[12:], None)).decode("utf-8")


def nonname_selectors(soup):
    sels = []
    for st in soup.find_all("style"):
        css = st.string or ""
        for rule in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
            sel, body = rule.group(1), rule.group(2)
            if "display:none" not in body.replace(" ", ""):
                continue
            for part in sel.split(","):
                part = part.strip()
                if part.startswith("body.nonname "):
                    s = part[len("body.nonname "):].strip()
                    if s and s != ".nda-only":
                        sels.append(s)
    return sels


def strip_admin(html):
    """当社のみの要素（class="admin-only"）を外した版を返す。外した要素のidを参照するインラインscriptも外す"""
    if "admin-only" not in html:
        return html
    soup = BeautifulSoup(html, "lxml")
    ids = set()
    for el in soup.select(".admin-only"):
        for x in [el] + el.find_all(True):
            if x.get("id"):
                ids.add(x["id"])
        el.decompose()
    for sc in soup.find_all("script"):
        body = sc.string or ""
        if not sc.get("src") and any(("'" + i + "'") in body or ('"' + i + '"') in body for i in ids):
            sc.decompose()
    return str(soup)


def make_public(full_html):
    soup = BeautifulSoup(full_html, "lxml")
    terms = set()
    for c in soup.select(".conf"):
        t = c.get_text(strip=True)
        if len(t) >= 2:
            terms.add(t)
    removed_ids = set()
    targets = soup.select(".nda-only")
    for sel in nonname_selectors(soup):
        try:
            targets += soup.select(sel)
        except Exception:
            print("  セレクタを解釈できず:", sel)
    for el in targets:
        if el.decomposed if hasattr(el, "decomposed") else False:
            continue
        try:
            for x in [el] + el.find_all(True):
                if x.get("id"):
                    removed_ids.add(x["id"])
            el.decompose()
        except Exception:
            pass
    for c in soup.select(".conf"):
        c.string = MASK
    for sc in soup.find_all("script"):
        if sc.get("src"):
            continue
        body = sc.string or ""
        if any(("'" + i + "'") in body or ('"' + i + '"') in body for i in removed_ids):
            sc.decompose()
    for cm in soup.find_all(string=lambda s: isinstance(s, Comment)):
        cm.extract()
    # 属性値（iframe の srcdoc、alt、data-* 等）に伏せ語句を含む要素は丸ごと削除
    for el in soup.find_all(True):
        if getattr(el, "decomposed", False) or el.attrs is None:
            continue
        vals = " ".join(str(v) for v in el.attrs.values())
        if any(t in vals for t in terms):
            el.decompose()
    return str(soup), terms


def check_leaks(public_html, terms, extra):
    leaks = [t for t in list(terms) + list(extra) if t and t in public_html]
    return leaks


def lockver(html):
    """lock.js の読み込みに内容ハッシュを付け、更新時にブラウザの古い読み込みが残らないようにする"""
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "listings", "lock.js")
    v = hashlib.sha256(open(root, "rb").read()).hexdigest()[:8]
    return re.sub(r'src="\.\./lock\.js(\?v=[0-9a-f]+)?"', 'src="../lock.js?v=' + v + '"', html)


def build(src_dir, only):
    ids = sorted({f.split(".")[0] for f in os.listdir(src_dir) if f.endswith(".html")})
    for L in ids:
        if only and L not in only:
            continue
        master = open(os.path.join(src_dir, L + ".html"), encoding="utf-8").read()
        full = strip_admin(master)
        pub_path = os.path.join(src_dir, L + ".public.html")
        extra_path = os.path.join(src_dir, L + ".secret-terms.txt")
        extra = [x.strip() for x in open(extra_path, encoding="utf-8").read().splitlines() if x.strip()] if os.path.exists(extra_path) else []
        if os.path.exists(pub_path):
            public = open(pub_path, encoding="utf-8").read()
            terms = set()
        else:
            public, terms = make_public(full)
        leaks = check_leaks(public, terms, extra)
        if leaks:
            sys.exit(f"[{L}] 公開版に伏せるべき語句が残っている: {leaks[:10]}")
        out = os.path.join(ROOT, "listings", L)
        os.makedirs(out, exist_ok=True)
        public, full, master = lockver(public), lockver(full), lockver(master)
        open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(public)
        open(os.path.join(out, "full.enc"), "wb").write(encrypt(L, full))
        open(os.path.join(out, "master.enc"), "wb").write(encrypt("m:" + L, master))
        print(f"[{L}] 公開版 {len(public):,} bytes / 完全版 {len(full):,} bytes → 暗号化済み（伏せ語句 {len(terms)+len(extra)} 件を検査）")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "build":
        build(sys.argv[2], sys.argv[3:])
    elif len(sys.argv) == 4 and sys.argv[1] == "decrypt":
        blob = open(os.path.join(ROOT, "listings", sys.argv[2], "full.enc"), "rb").read()
        open(sys.argv[3], "w", encoding="utf-8").write(decrypt(sys.argv[2], blob))
        print("復号:", sys.argv[3])
    else:
        print(__doc__)
