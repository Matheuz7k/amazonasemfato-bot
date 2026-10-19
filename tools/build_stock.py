"""Monta o acervo de fotos ilustrativas (web/public/stock) a partir do Wikimedia Commons.

Usado pelo estilo "2 fotos" quando a matéria só tem uma foto: a 2ª metade
recebe uma foto ilustrativa com crédito e licença (manifest.json).

Travas editoriais:
  - só CATEGORIAS de lugares/prédios/paisagens do Commons (nada de busca livre)
  - detector de rostos: qualquer foto com pessoa identificável é rejeitada
  - só licenças livres (CC0, domínio público, CC BY, CC BY-SA), horizontal, alta
  - variedade: no máximo 1 foto por "evento" (prefixo do título)

Uso:  python tools/build_stock.py        (requer: pip install opencv-python-headless)
"""

import io
import json
import os
import re
import sys

import cv2
import numpy as np
import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "stock")
API = "https://commons.wikimedia.org/w/api.php"
UA = "amazonasemfato-stock-builder/1.0 (contato: matheussantos.developer@gmail.com)"

# Categorias do Commons (lugares, não eventos) por tema. Temas sem acervo
# próprio (polícia, economia, saúde, educação…) usam o genérico MANAUS.
CATEGORIES = {
    "MANAUS": {
        "limit": 10,
        "cats": [
            "Aerial photographs of Manaus", "Ponte Rio Negro", "Negro-Amazon confluence",
            "Porto de Manaus", "Mercado Municipal Adolpho Lisboa", "Palácio da Justiça (Manaus)",
            "Igreja de São Sebastião (Manaus)", "Palacete Provincial (Manaus)",
            "Alfândega de Manaus", "Palácio Rio Negro",
        ],
    },
    "ESPORTE": {"limit": 4, "cats": ["Arena Amazônia"]},
    "CULTURA": {"limit": 4, "cats": ["Teatro Amazonas"]},
    "INTERIOR": {
        "limit": 6,
        "cats": ["Parintins (Amazonas)", "Negro River (tributary of the Amazon)",
                 "Parque Nacional de Anavilhanas", "Rio Tarumã-Açu"],
    },
    "POLÍTICA": {"limit": 3, "cats": ["Legislative Assembly of Amazonas (Brazil)", "Palácio Rio Branco (Manaus)", "Palácio Rio Negro"]},
    "ECONOMIA": {"limit": 3, "cats": ["Superintendência da Zona Franca de Manaus (SUFRAMA)", "Porto de Manaus"]},
    "EDUCAÇÃO": {"limit": 3, "cats": ["Universidade Federal do Amazonas"]},
}
# Temas sem acervo próprio usam o genérico MANAUS (cidade/paisagem: nunca induz
# a leitura errada em notícia policial ou de saúde)
ALIASES = {"AMAZONAS": "MANAUS", "ÚLTIMAS NOTÍCIAS": "MANAUS", "POLICIAL": "MANAUS", "SAÚDE": "MANAUS"}

BAD_NAME = re.compile(
    r"map|mapa|logo|bandeira|flag|bras[aã]o|coat|diagram|svg|escudo|selo|stamp|moeda|"
    r"planta|museu|museum|placa|plaque|altar|igreja interior|retrato|portrait|"
    r"sess[aã]o|session|deputad|senador|prefeito|governador|minist|evento|event|"
    r"inaugura|visita|cerim[oô]nia|posse|reuni[aã]o|coletiva|discurso|"
    r"\b1[89]\d\d\b|arquivo|postal|postcard|gravura|desenho|artesanato|interior|escada",
    re.I,
)
LICENSE_RANK = {"cc0": 0, "public domain": 0, "pd": 0, "cc by": 1, "cc-by": 1, "cc by-sa": 2, "cc-by-sa": 2}

FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
PROFILE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")


def license_rank(short):
    s = (short or "").lower()
    for key, rank in LICENSE_RANK.items():
        if s.startswith(key):
            return rank
    return None


def looks_old_or_flat(img: Image.Image) -> bool:
    """Rejeita preto-e-branco, sépia, escaneados e imagens chapadas (satélite, documento)."""
    small = img.convert("RGB").copy()
    small.thumbnail((200, 200))
    hsv = np.array(small.convert("HSV")).astype(np.float32)
    saturation = hsv[..., 1].mean() / 255
    value_std = hsv[..., 2].std()
    return saturation < 0.12 or value_std < 28


def has_people(img: Image.Image) -> bool:
    """Rejeita qualquer rosto razoavelmente visível (frontal ou de perfil)."""
    small = img.convert("L").copy()
    small.thumbnail((900, 900))
    arr = np.array(small)
    min_face = max(24, int(min(arr.shape) * 0.035))
    for cascade in (FACE, PROFILE):
        faces = cascade.detectMultiScale(arr, scaleFactor=1.1, minNeighbors=5, minSize=(min_face, min_face))
        if len(faces):
            return True
    return False


def category_files(cat: str):
    params = {
        "action": "query", "format": "json", "generator": "categorymembers",
        "gcmtitle": f"Category:{cat}", "gcmtype": "file", "gcmlimit": 60,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600,
    }
    resp = requests.get(API, params=params, headers={"User-Agent": UA}, timeout=40)
    resp.raise_for_status()
    return list(resp.json().get("query", {}).get("pages", {}).values())


def candidates_for(cats):
    found, seen = [], set()
    for cat in cats:
        try:
            pages = category_files(cat)
        except Exception as exc:
            print(f"  [aviso] categoria '{cat}': {exc}")
            continue
        for page in pages:
            info = (page.get("imageinfo") or [{}])[0]
            title = page.get("title", "")
            if not info or title in seen or BAD_NAME.search(title):
                continue
            seen.add(title)
            if info.get("mime") != "image/jpeg":
                continue
            w, h = info.get("width", 0), info.get("height", 0)
            if w < 1200 or not (1.3 <= w / max(1, h) <= 2.1):
                continue
            meta = info.get("extmetadata", {})
            rank = license_rank(meta.get("LicenseShortName", {}).get("value"))
            if rank is None:
                continue
            artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
            found.append({
                "rank": rank, "cat": cat, "title": title,
                "url": info.get("thumburl") or info["url"], "page": info.get("descriptionurl"),
                "author": (artist[:50] or "Wikimedia Commons"),
                "license": meta.get("LicenseShortName", {}).get("value", ""),
            })
    # licença mais permissiva primeiro; intercala categorias para variar
    found.sort(key=lambda f: f["rank"])
    return found


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        os.remove(os.path.join(OUT, old))
    manifest = {}
    for theme, spec in CATEGORIES.items():
        print(f"== {theme}")
        slug = re.sub(r"[^a-z0-9]+", "-", theme.lower().encode("ascii", "ignore").decode()).strip("-")
        saved, used_cats, used_prefix = [], {}, set()
        for cand in candidates_for(spec["cats"]):
            if len(saved) >= spec["limit"]:
                break
            prefix = re.sub(r"\W+", "", cand["title"].lower())[:22]
            if prefix in used_prefix or used_cats.get(cand["cat"], 0) >= 3:
                continue
            try:
                data = requests.get(cand["url"], headers={"User-Agent": UA}, timeout=60).content
                img = Image.open(io.BytesIO(data)).convert("RGB")
                if looks_old_or_flat(img):
                    print(f"  pulando (antiga/chapada): {cand['title'][:55]}")
                    continue
                if has_people(img):
                    print(f"  pulando (pessoas): {cand['title'][:55]}")
                    continue
                img.thumbnail((1400, 1400), Image.LANCZOS)
                name = f"{slug}-{len(saved) + 1}.jpg"
                img.save(os.path.join(OUT, name), "JPEG", quality=82, optimize=True)
                saved.append({
                    "file": f"stock/{name}", "author": cand["author"], "license": cand["license"],
                    "source": cand["page"], "title": cand["title"],
                })
                used_prefix.add(prefix)
                used_cats[cand["cat"]] = used_cats.get(cand["cat"], 0) + 1
                print(f"  ok {name} <- {cand['title'][:55]} [{cand['license']}]")
            except Exception as exc:
                print(f"  [aviso] falhou: {exc}")
        if saved:
            manifest[theme] = saved
    for alias, target in ALIASES.items():
        if target in manifest:
            manifest[alias] = manifest[target]
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for k, v in manifest.items() if k in CATEGORIES)
    print(f"\nmanifest: {total} fotos em {len(CATEGORIES)} temas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
