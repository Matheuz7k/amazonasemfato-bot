"""Publicação via Instagram API with Instagram Login (graph.instagram.com)."""

import time

import requests

from . import config

BASE = f"{config.GRAPH_HOST}/{config.GRAPH_VERSION}"


class InstagramError(RuntimeError):
    pass


def _check(resp: requests.Response) -> dict:
    data = resp.json()
    if not resp.ok or "error" in data:
        raise InstagramError(f"API do Instagram retornou erro: {data}")
    return data


def publishing_quota_remaining() -> int:
    resp = requests.get(
        f"{BASE}/{config.IG_USER_ID}/content_publishing_limit",
        params={"access_token": config.IG_ACCESS_TOKEN},
        timeout=30,
    )
    data = _check(resp)
    usage = data["data"][0]
    return usage["config"]["quota_total"] - usage["quota_usage"]


def publish_image(image_url: str, caption: str) -> str:
    """Cria o container de mídia, espera processar e publica. Retorna o media_id."""
    resp = requests.post(
        f"{BASE}/{config.IG_USER_ID}/media",
        data={
            "image_url": image_url,
            "caption": caption,
            "access_token": config.IG_ACCESS_TOKEN,
        },
        timeout=60,
    )
    container_id = _check(resp)["id"]
    print(f"[info] container criado: {container_id}")

    # A Meta recomenda checar o status 1x/minuto por até 5 minutos
    for attempt in range(10):
        resp = requests.get(
            f"{BASE}/{container_id}",
            params={"fields": "status_code", "access_token": config.IG_ACCESS_TOKEN},
            timeout=30,
        )
        status = _check(resp).get("status_code")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            raise InstagramError(f"container {container_id} terminou com status {status}")
        print(f"[info] container {status}, aguardando… ({attempt + 1}/10)")
        time.sleep(30)

    resp = requests.post(
        f"{BASE}/{config.IG_USER_ID}/media_publish",
        data={"creation_id": container_id, "access_token": config.IG_ACCESS_TOKEN},
        timeout=60,
    )
    media_id = _check(resp)["id"]
    print(f"[ok] publicado! media_id={media_id}")
    return media_id
