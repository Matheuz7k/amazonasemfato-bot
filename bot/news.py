"""Coleta e seleção de notícias a partir dos feeds RSS."""

import calendar
import hashlib
import html
import io
import json
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import feedparser
import requests

from . import config


def _entry_id(entry) -> str:
    raw = entry.get("link") or entry.get("id") or entry.get("title", "")
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _published_utc(entry):
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime.fromtimestamp(calendar.timegm(parsed), tz=timezone.utc)
    return None


def load_posted() -> dict:
    if os.path.exists(config.POSTED_DB):
        with open(config.POSTED_DB, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_posted(posted: dict) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=config.DEDUP_RETENTION_DAYS)
    pruned = {
        k: v for k, v in posted.items()
        if datetime.fromisoformat(v["posted_at"]) > cutoff
    }
    os.makedirs(os.path.dirname(config.POSTED_DB), exist_ok=True)
    with open(config.POSTED_DB, "w", encoding="utf-8") as f:
        json.dump(pruned, f, ensure_ascii=False, indent=1, sort_keys=True)


_LOGO_URL_RE = re.compile(r"logo|logotipo|placeholder|favicon|avatar|brasao|marca-dagua", re.I)


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


_HOLANDA_SECTIONS = ["amazonas", "policial", "manaus", "economia", "politica",
                     "mundo", "brasil", "esporte", "famosos-tv"]


def _resolve_holanda_link(entry, title: str) -> str | None:
    """Reconstrói a URL real (/secao/slug): tag do RSS primeiro, depois as demais seções."""
    tags = [t.get("term", "") for t in entry.get("tags", []) or []]
    # O site remove pontuação sem separador ("J&F" → "jf"); testa as duas formas
    slugs = list(dict.fromkeys([
        _slugify(title),
        _slugify(re.sub(r"[&'’\"“”.,:;!?()]", "", title)),
    ]))
    sections = [_slugify(tags[0])] if tags else []
    sections += [s for s in _HOLANDA_SECTIONS if s not in sections]
    for section in sections:
        for slug in slugs:
            url = f"https://www.portaldoholanda.com.br/{section}/{slug}"
            try:
                resp = requests.get(url, timeout=12, headers={"User-Agent": config.USER_AGENT})
                if resp.ok and "og:image" in resp.text:
                    return url
            except Exception:
                continue
    return None


def _blocked(title: str, summary: str) -> bool:
    text = f"{title} {summary}".lower()
    return any(term in text for term in config.TITLE_BLOCKLIST)


def _is_local(feed: dict, entry, title: str, summary: str, link: str) -> bool:
    link = (link or "").lower()
    if any(p in link for p in feed.get("local_link_patterns", [])):
        return True
    ignore = feed.get("ignore_tags", [])
    tags = " ".join(
        t.get("term", "") for t in entry.get("tags", []) or []
        if not any(ig in t.get("term", "").lower() for ig in ignore)
    )
    text = f"{tags} {title} {summary}".lower()
    return any(term in text for term in config.LOCAL_TERMS)


def fetch_candidates(posted: dict) -> list:
    """Retorna notícias recentes ainda não publicadas, mais novas primeiro."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=config.MAX_AGE_HOURS)
    candidates = []
    for feed in config.FEEDS:
        parsed = None
        for url in (feed["url"], f"{config.MIRROR_BASE}{_slugify(feed['name'])}.xml"):
            try:
                resp = requests.get(
                    url, timeout=30, headers={"User-Agent": config.USER_AGENT},
                )
                resp.raise_for_status()
                candidate = feedparser.parse(resp.content)
                if candidate.entries:
                    parsed = candidate
                    break
            except Exception as exc:
                if url == feed["url"]:
                    print(f"[aviso] feed {feed['name']} falhou ({exc}); tentando espelho")
        if parsed is None:  # feed fora do ar não derruba a execução
            print(f"[aviso] feed {feed['name']} indisponível (direto e espelho)")
            continue

        for entry in parsed.entries[:20]:
            eid = _entry_id(entry)
            if eid in posted:
                continue
            published = _published_utc(entry)
            if not published or published < cutoff:
                continue
            title = _clean_html(entry.get("title", ""))
            summary = _clean_html(entry.get("summary", ""))[:500]
            if len(title) < 20 or _blocked(title, summary):
                continue
            if feed.get("filter_local") and not _is_local(
                feed, entry, title, summary, entry.get("link", "")
            ):
                continue
            link = entry.get("link", "")
            if feed.get("resolve_link") == "holanda":
                link = _resolve_holanda_link(entry, title) or link
            candidates.append({
                "id": eid,
                "source": feed["name"],
                "title": title,
                "summary": summary,
                "link": link,
                "published": published,
                "entry": entry,
            })

    candidates.sort(key=lambda c: c["published"], reverse=True)
    return candidates


_STOPWORDS = {
    "a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos",
    "nas", "para", "por", "com", "que", "um", "uma", "ao", "os", "as", "é",
    "após", "nesta", "neste", "diz", "sobre",
}


def _title_words(title: str) -> set:
    words = re.findall(r"\w+", title.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _same_story(title_a: str, title_b: str) -> bool:
    """Detecta a mesma notícia publicada por veículos diferentes."""
    a, b = _title_words(title_a), _title_words(title_b)
    if not a or not b:
        return False
    overlap = len(a & b) / min(len(a), len(b))
    return overlap >= 0.6


def pick_items(candidates: list, posted: dict, limit: int) -> list:
    """Escolhe até `limit` notícias, evitando repetir fonte e histórias já postadas."""
    posted_titles = [v["title"] for v in posted.values()]
    last_source = None
    if posted:
        latest = max(posted.values(), key=lambda v: v["posted_at"])
        last_source = latest.get("source")

    picked = []
    remaining = [
        c for c in candidates
        if not any(_same_story(c["title"], t) for t in posted_titles)
    ]
    for _ in range(limit):
        if not remaining:
            break
        choice = next(
            (c for c in remaining if c["source"] != last_source), remaining[0]
        )
        picked.append(choice)
        remaining = [
            c for c in remaining
            if c is not choice and not _same_story(c["title"], choice["title"])
        ]
        last_source = choice["source"]
    return picked


_OG_IMAGE_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)["\']'
    r'|<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image(?::url)?["\']',
    re.IGNORECASE,
)


def fetch_article_image(item: dict) -> bytes | None:
    """Baixa a imagem principal da matéria (media:content do RSS ou og:image)."""
    urls = []
    entry = item.get("entry")
    if entry is not None:
        for media in entry.get("media_content", []) or []:
            if media.get("url"):
                urls.append(media["url"])
        for enc in entry.get("enclosures", []) or []:
            if enc.get("href") and "image" in (enc.get("type") or "image"):
                urls.append(enc["href"])

    if not urls and item.get("link"):
        try:
            page = requests.get(
                item["link"], timeout=30,
                headers={"User-Agent": config.USER_AGENT},
            )
            match = _OG_IMAGE_RE.search(page.text)
            if match:
                urls.append(html.unescape(match.group(1) or match.group(2)))
        except Exception as exc:
            print(f"[aviso] og:image falhou para {item['link']}: {exc}")

    for url in urls:
        if _LOGO_URL_RE.search(url):
            continue  # logo do portal no lugar de foto
        try:
            resp = requests.get(
                url, timeout=30, headers={"User-Agent": config.USER_AGENT}
            )
            if not resp.ok or len(resp.content) < 10_000:
                continue
            # Rejeita letreiro/banner/ícone: só foto de verdade entra no card
            from PIL import Image
            w, h = Image.open(io.BytesIO(resp.content)).size
            ratio = w / max(1, h)
            if w < 320 or h < 300 or ratio > 2.05 or ratio < 0.45:
                continue
            return resp.content
        except Exception:
            continue
    return None


def build_caption(item: dict) -> str:
    # O gancho precisa caber nos primeiros ~125 caracteres do feed
    parts = [f"🔴 {item['title']}"]
    if item["summary"] and item["summary"].lower() != item["title"].lower():
        summary = item["summary"]
        if len(summary) > 280:
            summary = summary[:277].rsplit(" ", 1)[0] + "…"
        parts.append(summary)
    parts.append(f"📰 Fonte: {item['source']}")
    parts.append("📲 Siga @amazonasemfato para mais notícias do Amazonas!")
    parts.append(config.HASHTAGS)
    return "\n\n".join(parts)


def mark_posted(posted: dict, item: dict, media_id: str, image_path: str) -> None:
    posted[item["id"]] = {
        "title": item["title"],
        "source": item["source"],
        "link": item["link"],
        "media_id": media_id,
        "image": image_path,
        "posted_at": datetime.now(timezone.utc).isoformat(),
    }
