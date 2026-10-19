"""Orquestração: coleta notícias, gera cards e publica no Instagram.

Modos:
  python -m bot.main            → fluxo completo (requer secrets + GitHub Actions)
  DRY_RUN=1 python -m bot.main  → só gera os cards localmente, sem publicar
"""

import os
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime, timezone

import requests

from . import card, config, instagram, news

DRY_RUN = os.environ.get("DRY_RUN") == "1" or not (
    config.IG_ACCESS_TOKEN and config.IG_USER_ID
)


def _slugify(text: str, max_len: int = 60) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_len].rstrip("-")


def _git(*args: str) -> None:
    subprocess.run(["git", *args], check=True, cwd=config.ROOT)


def _git_commit_push(message: str, *paths: str) -> None:
    _git("add", *paths)
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"], cwd=config.ROOT
    )
    if result.returncode == 0:
        return  # nada mudou
    _git("commit", "-m", message)
    _git("push")


def _raw_url(rel_path: str) -> str:
    repo = os.environ["GITHUB_REPOSITORY"]
    branch = os.environ.get("GITHUB_REF_NAME", "main")
    return f"https://raw.githubusercontent.com/{repo}/{branch}/{rel_path}"


def _wait_public(url: str, attempts: int = 12) -> None:
    for i in range(attempts):
        try:
            resp = requests.head(url, timeout=15)
            if resp.ok:
                return
        except requests.RequestException:
            pass
        print(f"[info] aguardando URL pública ficar disponível… ({i + 1}/{attempts})")
        time.sleep(10)
    raise RuntimeError(f"imagem não ficou acessível publicamente: {url}")


def main() -> int:
    posted = news.load_posted()
    candidates = news.fetch_candidates(posted)
    print(f"[info] {len(candidates)} notícias candidatas encontradas")
    if not candidates:
        print("[info] nada novo para postar — encerrando")
        return 0

    items = news.pick_items(candidates, posted, config.MAX_POSTS_PER_RUN)

    if not DRY_RUN:
        remaining = instagram.publishing_quota_remaining()
        print(f"[info] cota de publicação restante nas últimas 24h: {remaining}")
        items = items[: max(0, remaining)]

    published_any = False
    for item in items:
        now = datetime.now(timezone.utc)
        rel_path = (
            f"posts/{now:%Y/%m}/{now:%Y%m%d-%H%M%S}-{_slugify(item['title'])}.jpg"
        )
        out_path = os.path.join(config.ROOT, rel_path)

        image_bytes = news.fetch_article_image(item)
        if image_bytes is None:
            print(f"[aviso] sem imagem para '{item['title'][:60]}…' — usando fundo padrão")
        card.render_card(
            item["title"], item["source"], image_bytes, item["published"], out_path
        )
        print(f"[ok] card gerado: {rel_path}")

        if DRY_RUN:
            print("[dry-run] publicação pulada")
            continue

        # A API da Meta baixa a imagem por URL pública → sobe o card para o repo antes
        _git_commit_push(f"card: {item['title'][:70]}", rel_path)
        image_url = _raw_url(rel_path)
        _wait_public(image_url)

        caption = news.build_caption(item)
        try:
            media_id = instagram.publish_image(image_url, caption)
        except instagram.InstagramError as exc:
            print(f"[erro] falha ao publicar: {exc}")
            continue

        news.mark_posted(posted, item, media_id, rel_path)
        news.save_posted(posted)
        _git_commit_push(
            f"posted: {item['title'][:70]}", os.path.join("data", "posted.json")
        )
        published_any = True

    if not DRY_RUN and items and not published_any:
        return 1  # tinha candidatos, mas nenhuma publicação deu certo
    return 0


if __name__ == "__main__":
    sys.exit(main())
