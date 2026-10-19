"""Geração do card de notícia (1080x1350, padrão de página de notícias no IG)."""

import io
import os
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import config

W, H = 1080, 1440  # 3:4, padrão atual do feed/grade do Instagram
MARGIN = 72
RED = (198, 30, 34)
WHITE = (255, 255, 255)
GRAY = (205, 205, 210)

# Fuso de Manaus (UTC-4, sem horário de verão)
MANAUS_TZ = timezone(timedelta(hours=-4))


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(config.FONTS_DIR, name), size)


def _cover_resize(img: Image.Image) -> Image.Image:
    """Redimensiona e corta a imagem para cobrir todo o canvas (como CSS cover)."""
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (img.width - W) // 2
    top = (img.height - H) // 2
    return img.crop((left, top, left + W, top + H))


def _fallback_background() -> Image.Image:
    """Gradiente escuro para quando a matéria não tem imagem."""
    img = Image.new("RGB", (W, H))
    for y in range(H):
        t = y / H
        img.paste((int(12 + 20 * t), int(22 + 14 * t), int(38 + 10 * t)), (0, y, W, y + 1))
    return img


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _fit_headline(draw: ImageDraw.ImageDraw, text: str, max_width: int):
    """Escolhe o maior tamanho de fonte em que a manchete cabe em até 6 linhas."""
    for size in range(76, 42, -4):
        font = _font("Montserrat-ExtraBold.ttf", size)
        lines = _wrap(draw, text, font, max_width)
        if len(lines) <= 6:
            return font, lines, size
    font = _font("Montserrat-ExtraBold.ttf", 42)
    lines = _wrap(draw, text, font, max_width)[:6]
    if len(lines) == 6:
        lines[-1] = lines[-1].rstrip(".") + "…"
    return font, lines, 42


def render_card(title: str, source: str, image_bytes: bytes | None,
                published: datetime, out_path: str) -> str:
    if image_bytes:
        try:
            photo = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            bg = _cover_resize(photo).filter(ImageFilter.GaussianBlur(0))
        except Exception:
            bg = _fallback_background()
    else:
        bg = _fallback_background()

    # Overlay: escurece de cima (leve) a baixo (forte) para dar contraste ao texto
    overlay = Image.new("L", (1, H))
    for y in range(H):
        t = y / H
        overlay.putpixel((0, y), int(60 + 165 * (t ** 1.6)))
    overlay = overlay.resize((W, H))
    black = Image.new("RGB", (W, H), (6, 8, 12))
    bg = Image.composite(black, bg, overlay)

    draw = ImageDraw.Draw(bg)

    # Marca no topo: usa assets/logo.png se existir, senão o chip de texto
    if os.path.exists(config.LOGO_PATH):
        logo = Image.open(config.LOGO_PATH).convert("RGBA")
        logo_h = 110
        logo = logo.resize(
            (round(logo.width * logo_h / logo.height), logo_h), Image.LANCZOS
        )
        bg.paste(logo, (MARGIN, MARGIN), logo)
    else:
        brand_font = _font("Montserrat-ExtraBold.ttf", 34)
        brand_text = "AMAZONAS EM FATO"
        pad_x, pad_y = 28, 16
        tw = draw.textlength(brand_text, font=brand_font)
        chip_h = 34 + 2 * pad_y
        draw.rounded_rectangle(
            (MARGIN, MARGIN, MARGIN + tw + 2 * pad_x, MARGIN + chip_h),
            radius=14, fill=RED,
        )
        draw.text((MARGIN + pad_x, MARGIN + pad_y - 2), brand_text,
                  font=brand_font, fill=WHITE)

    # Rodapé: fonte + data/hora de Manaus
    meta_font = _font("Montserrat-Medium.ttf", 30)
    local_time = published.astimezone(MANAUS_TZ)
    meta = f"{local_time.strftime('%d/%m/%Y %H:%M')}  •  @amazonasemfato"
    meta_y = H - MARGIN - 34
    draw.text((MARGIN, meta_y), meta, font=meta_font, fill=GRAY)

    # Manchete, ancorada acima do rodapé
    max_text_w = W - 2 * MARGIN
    font, lines, size = _fit_headline(draw, title, max_text_w)
    line_h = int(size * 1.22)
    text_h = line_h * len(lines)
    y = meta_y - 36 - text_h
    # Barra de destaque à esquerda da manchete
    draw.rectangle((MARGIN - 28, y + 6, MARGIN - 16, y + text_h - 6), fill=RED)
    for line in lines:
        draw.text((MARGIN, y), line, font=font, fill=WHITE)
        y += line_h

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    quality = 90
    bg.save(out_path, "JPEG", quality=quality, optimize=True)
    # Garante o limite de 8 MB da API do Instagram
    while os.path.getsize(out_path) > 7_800_000 and quality > 50:
        quality -= 10
        bg.save(out_path, "JPEG", quality=quality, optimize=True)
    return out_path
