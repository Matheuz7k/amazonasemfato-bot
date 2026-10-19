"""Espelho de feeds RSS — roda no PC (IP residencial) via Agendador de Tarefas.

Portais como o D24AM bloqueiam qualquer IP de datacenter (Vercel, GitHub,
proxies públicos). Este script baixa os feeds daqui e publica no branch
`mirror` do repositório (um único commit, sobrescrito a cada execução), que
o Studio e o bot usam como fallback:

  https://raw.githubusercontent.com/Matheuz7k/amazonasemfato-bot/mirror/<slug>.xml

Agendar (a cada 10 min, sem janela):
  schtasks /create /sc minute /mo 10 /tn "AmazonasEmFato Mirror" ^
    /tr "\"C:\\...\\pythonw.exe\" \"C:\\Users\\win10\\amazonasemfato-bot\\tools\\mirror_feeds.py\"" /f
"""

import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

import requests

REPO = "https://github.com/Matheuz7k/amazonasemfato-bot.git"
FEEDS = {
    "d24am": "https://d24am.com/feed/",
    "a-critica": "https://www.acritica.com/rss",
    "g1-amazonas": "https://g1.globo.com/rss/g1/am/amazonas/",
    "portal-em-tempo": "https://emtempo.com.br/feed/",
    "portal-do-holanda": "https://www.portaldoholanda.com.br/feed",
}
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mirror.log")


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)


def main() -> int:
    work = tempfile.mkdtemp(prefix="aef-mirror-")
    saved = 0
    try:
        for slug, url in FEEDS.items():
            try:
                resp = requests.get(url, timeout=30, headers={"User-Agent": UA})
                head = resp.content[:4000].lower()
                if resp.ok and (b"<rss" in head or b"<feed" in head):
                    with open(os.path.join(work, f"{slug}.xml"), "wb") as f:
                        f.write(resp.content)
                    saved += 1
                else:
                    log(f"{slug}: resposta inválida ({resp.status_code})")
            except Exception as exc:
                log(f"{slug}: falhou ({exc})")

        if saved == 0:
            log("nenhum feed salvo — nada publicado")
            return 1

        with open(os.path.join(work, "updated.txt"), "w", encoding="utf-8") as f:
            f.write(datetime.now(timezone.utc).isoformat())

        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        git = lambda *a: subprocess.run(  # noqa: E731
            ["git", *a], cwd=work, check=True, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        )
        git("init", "-q")
        git("checkout", "-q", "--orphan", "mirror")
        git("add", "-A")
        git("-c", "user.name=amazonasemfato-mirror",
            "-c", "user.email=mirror@amazonasemfato.local",
            "commit", "-q", "-m", f"mirror {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC")
        git("push", "-q", "-f", REPO, "mirror")
        log(f"ok — {saved} feed(s) publicados no branch mirror")
        return 0
    except subprocess.CalledProcessError as exc:
        log(f"git falhou: {exc.stderr.strip()[:300]}")
        return 1
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
