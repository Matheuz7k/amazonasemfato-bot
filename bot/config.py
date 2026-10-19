"""Configurações do bot @amazonasemfato."""

import os

# Fontes de notícias (RSS).
# filter_local=True → só aceita a notícia se as categorias/título/resumo
# mencionarem o Amazonas (esses portais também publicam Brasil/Mundo).
FEEDS = [
    {"name": "G1 Amazonas", "url": "https://g1.globo.com/rss/g1/am/amazonas/", "filter_local": False},
    {
        "name": "D24AM",
        "url": "https://d24am.com/feed/",
        "filter_local": True,
        # tags de marca presentes em todas as matérias — não indicam notícia local
        "ignore_tags": ["diário do amazonas", "dez minutos", "tv diário", "d24"],
        # seções do site que são sempre locais
        "local_link_patterns": ["/amazonas/", "/manaus/", "/policia/", "/interior/"],
    },
    {"name": "Portal Em Tempo", "url": "https://emtempo.com.br/feed/", "filter_local": True},
    # O RSS do Holanda aponta para /articles/ID (404); a URL real é /secao/slug
    {"name": "Portal do Holanda", "url": "https://www.portaldoholanda.com.br/feed", "filter_local": True,
     "resolve_link": "holanda"},
    {"name": "A Crítica", "url": "https://www.acritica.com/rss", "filter_local": True},
]

# Termos que caracterizam notícia local (estado, capital e municípios do interior)
LOCAL_TERMS = [
    "amazonas", "manaus", "amazônia", "interior do am", " am)", "(am",
    "parintins", "itacoatiara", "manacapuru", "coari", "tefé", "tabatinga",
    "maués", "humaitá", "iranduba", "lábrea", "borba", "autazes", "careiro",
    "barcelos", "são gabriel da cachoeira", "benjamin constant", "eirunepé",
    "nova olinda do norte", "presidente figueiredo", "rio preto da eva",
    "manicoré", "novo airão", "urucará", "boca do acre", "codajás", "fonte boa",
    "zona franca", "suframa", "rio negro", "rio solimões", "rio madeira",
    "dehs", "deaai", "ssp-am", "detran-am", "prefeitura de manaus", "wilson lima",
    "david almeida", "aleam", "tjam", "ufam", "uea ",
]

# Palavras no título/resumo que descartam a notícia (ex.: conteúdo pago, horóscopo).
TITLE_BLOCKLIST = [
    "horóscopo",
    "resultado da lotofácil",
    "resultado da mega-sena",
    "publieditorial",
    "conteúdo patrocinado",
]

# Modo de operação:
#   draft   → gera card + legenda e coloca na fila (docs/) para você postar à mão
#   publish → publica sozinho no Instagram via API (requer secrets IG_*)
MODE = os.environ.get("MODE", "draft")

# Quantos posts por execução. Em draft gera mais opções para você escolher;
# em publish (API permite 100/dia) menos é melhor para o algoritmo.
MAX_POSTS_PER_RUN = int(
    os.environ.get("MAX_POSTS_PER_RUN") or ("3" if MODE == "draft" else "1")
)

# Idade máxima da notícia para ser considerada (horas)
MAX_AGE_HOURS = int(os.environ.get("MAX_AGE_HOURS", "12"))

# Hashtags fixas da legenda (3–5 focadas rendem mais alcance que listas longas)
HASHTAGS = "#Manaus #Amazonas #Notícias #AmazonasEmFato #InteriorDoAmazonas"

# Credenciais (definidas como secrets no GitHub Actions)
IG_ACCESS_TOKEN = os.environ.get("IG_ACCESS_TOKEN", "")
IG_USER_ID = os.environ.get("IG_USER_ID", "")

GRAPH_HOST = "https://graph.instagram.com"
GRAPH_VERSION = "v23.0"

# Caminhos
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTED_DB = os.path.join(ROOT, "data", "posted.json")
POSTS_DIR = os.path.join(ROOT, "posts")
FONTS_DIR = os.path.join(ROOT, "assets", "fonts")
LOGO_PATH = os.path.join(ROOT, "assets", "logo.png")
DOCS_DIR = os.path.join(ROOT, "docs")
QUEUE_JSON = os.path.join(DOCS_DIR, "fila.json")

# Quantos itens ficam visíveis na página da fila
QUEUE_PAGE_LIMIT = 40

# Dias que uma entrada fica no histórico de deduplicação
DEDUP_RETENTION_DAYS = 30

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 amazonasemfato-bot"
)
