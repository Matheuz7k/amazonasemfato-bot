"""Página da fila de posts (docs/index.html, servida pelo GitHub Pages).

Lista os cards prontos, mais novos primeiro, com botão de copiar a legenda
e link para baixar a imagem — feita para usar no celular.
"""

import html
import json
import os
from datetime import datetime, timedelta, timezone

from . import config

MANAUS_TZ = timezone(timedelta(hours=-4))

_PAGE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fila de posts — @amazonasemfato</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; margin: 0; }}
  body {{
    font-family: system-ui, -apple-system, sans-serif;
    background: #0d1117; color: #e6edf3;
    max-width: 560px; margin: 0 auto; padding: 20px 16px 60px;
  }}
  h1 {{ font-size: 1.25rem; margin-bottom: 4px; }}
  .sub {{ color: #8b949e; font-size: .85rem; margin-bottom: 24px; }}
  .card {{
    background: #161b22; border: 1px solid #30363d; border-radius: 14px;
    overflow: hidden; margin-bottom: 22px;
  }}
  .card img {{ width: 100%; display: block; }}
  .body {{ padding: 14px; }}
  .meta {{ color: #8b949e; font-size: .78rem; margin-bottom: 10px; }}
  textarea {{
    width: 100%; min-height: 110px; background: #0d1117; color: #e6edf3;
    border: 1px solid #30363d; border-radius: 8px; padding: 10px;
    font-size: .82rem; resize: vertical;
  }}
  .row {{ display: flex; gap: 10px; margin-top: 10px; }}
  .btn {{
    flex: 1; text-align: center; padding: 12px; border-radius: 8px;
    font-weight: 700; font-size: .9rem; cursor: pointer; border: none;
    text-decoration: none; color: #fff;
  }}
  .copy {{ background: #c61e22; }}
  .down {{ background: #21262d; border: 1px solid #30363d; }}
  .copy.ok {{ background: #238636; }}
</style>
</head>
<body>
<h1>📰 Fila de posts — @amazonasemfato</h1>
<p class="sub">Atualizada em {updated} (horário de Manaus). Baixe a imagem,
copie a legenda e poste. Novos cards chegam sozinhos ao longo do dia.</p>
{cards}
<script>
function copiar(btn, id) {{
  const ta = document.getElementById(id);
  ta.select();
  navigator.clipboard.writeText(ta.value).then(() => {{
    btn.textContent = "✓ Copiada!";
    btn.classList.add("ok");
    setTimeout(() => {{ btn.textContent = "Copiar legenda"; btn.classList.remove("ok"); }}, 2000);
  }});
}}
</script>
</body>
</html>
"""

_CARD = """<div class="card">
  <a href="{image}" download><img src="{image}" alt="" loading="lazy"></a>
  <div class="body">
    <div class="meta">{source} • {when}</div>
    <textarea id="c{idx}" readonly>{caption}</textarea>
    <div class="row">
      <button class="btn copy" onclick="copiar(this,'c{idx}')">Copiar legenda</button>
      <a class="btn down" href="{image}" download>Baixar imagem</a>
    </div>
  </div>
</div>"""


def load_queue() -> list:
    if os.path.exists(config.QUEUE_JSON):
        with open(config.QUEUE_JSON, encoding="utf-8") as f:
            return json.load(f)
    return []


def add_to_queue(queue: list, item: dict, caption: str, image_rel_docs: str) -> None:
    queue.insert(0, {
        "title": item["title"],
        "source": item["source"],
        "caption": caption,
        "image": image_rel_docs,  # caminho relativo à pasta docs/
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    del queue[config.QUEUE_PAGE_LIMIT:]


def render(queue: list) -> None:
    cards = []
    for idx, entry in enumerate(queue):
        when = (
            datetime.fromisoformat(entry["created_at"])
            .astimezone(MANAUS_TZ)
            .strftime("%d/%m às %H:%M")
        )
        cards.append(_CARD.format(
            idx=idx,
            image=html.escape(entry["image"]),
            source=html.escape(entry["source"]),
            when=when,
            caption=html.escape(entry["caption"]),
        ))

    updated = datetime.now(MANAUS_TZ).strftime("%d/%m/%Y às %H:%M")
    page = _PAGE.format(updated=updated, cards="\n".join(cards))

    os.makedirs(config.DOCS_DIR, exist_ok=True)
    with open(os.path.join(config.DOCS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    with open(config.QUEUE_JSON, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=1)
