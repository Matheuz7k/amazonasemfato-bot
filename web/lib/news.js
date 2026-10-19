// Coleta e seleção de notícias — mesma lógica do bot Python (bot/news.py)

import { XMLParser } from "fast-xml-parser";

export const FEEDS = [
  { name: "G1 Amazonas", url: "https://g1.globo.com/rss/g1/am/amazonas/", filterLocal: false },
  {
    name: "D24AM",
    url: "https://d24am.com/feed/",
    filterLocal: true,
    ignoreTags: ["diário do amazonas", "dez minutos", "tv diário", "d24"],
    localLinkPatterns: ["/amazonas/", "/manaus/", "/policia/", "/interior/"],
  },
  { name: "Portal Em Tempo", url: "https://emtempo.com.br/feed/", filterLocal: true },
  // O RSS do Holanda aponta para /articles/ID (404); a URL real é /secao/slug
  { name: "Portal do Holanda", url: "https://www.portaldoholanda.com.br/feed", filterLocal: true, resolveLink: "holanda" },
  { name: "A Crítica", url: "https://www.acritica.com/rss", filterLocal: true },
];

const LOCAL_TERMS = [
  "amazonas", "manaus", "amazônia", "interior do am", " am)", "(am",
  "parintins", "itacoatiara", "manacapuru", "coari", "tefé", "tabatinga",
  "maués", "humaitá", "iranduba", "lábrea", "borba", "autazes", "careiro",
  "barcelos", "são gabriel da cachoeira", "benjamin constant", "eirunepé",
  "nova olinda do norte", "presidente figueiredo", "rio preto da eva",
  "manicoré", "novo airão", "urucará", "boca do acre", "codajás", "fonte boa",
  "zona franca", "suframa", "rio negro", "rio solimões", "rio madeira",
  "dehs", "deaai", "ssp-am", "detran-am", "prefeitura de manaus", "wilson lima",
  "david almeida", "aleam", "tjam", "ufam", "uea ",
];

const TITLE_BLOCKLIST = [
  "horóscopo", "resultado da lotofácil", "resultado da mega-sena",
  "publieditorial", "conteúdo patrocinado",
];

// 3–5 hashtags focadas rendem mais alcance que listas longas (prática 2026)
const HASHTAGS = "#Manaus #Amazonas #Notícias #AmazonasEmFato #InteriorDoAmazonas";

const CATEGORY_EMOJI = {
  POLICIAL: "🚨",
  ECONOMIA: "💰",
  "POLÍTICA": "🏛️",
  ESPORTE: "⚽",
  CULTURA: "🎭",
  "EDUCAÇÃO": "📚",
  "SAÚDE": "🏥",
  INTERIOR: "🛶",
  MANAUS: "🔴",
  AMAZONAS: "🔴",
  "ÚLTIMAS NOTÍCIAS": "🔴",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 amazonasemfato-bot";

const MAX_AGE_HOURS = 24;

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LOGO_URL_RE = /logo|logotipo|placeholder|favicon|avatar|brasao|marca-dagua/i;

// Mesma foto em tamanhos/CDNs diferentes? Compara pelo nome do arquivo,
// ignorando sufixos de tamanho do WordPress (-1024x683, -scaled, -e1697...)
export function sameImage(a, b) {
  if (!a || !b) return false;
  const name = (u) =>
    String(u).split("?")[0].split("/").pop().toLowerCase()
      .replace(/\.\w{3,4}$/, "")
      .replace(/-\d{2,4}x\d{2,4}/g, "")
      .replace(/-scaled|-e\d{8,}/g, "");
  return a === b || name(a) === name(b);
}

function stripHtml(text) {
  return String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function entryCategories(item) {
  return asArray(item.category).map((c) =>
    typeof c === "string" ? c : c["#text"] ?? ""
  );
}

function entryImages(item) {
  const urls = [];
  for (const m of asArray(item["media:content"])) {
    if (m["@_url"]) urls.push(m["@_url"]);
  }
  const enc = item.enclosure;
  if (enc?.["@_url"] && (enc["@_type"] ?? "image").includes("image")) {
    urls.push(enc["@_url"]);
  }
  const html = `${item["content:encoded"] ?? ""} ${item.description ?? ""}`;
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    urls.push(m[1]);
  }
  // normaliza, tira thumbnails repetidos/dados inline e deduplica
  const seen = new Set();
  const out = [];
  for (let u of urls) {
    if (!u || u.startsWith("data:")) continue;
    u = fullSizeImage(u);
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out.slice(0, 3);
}

function isLocal(feed, item, title, summary, link) {
  const l = (link ?? "").toLowerCase();
  if ((feed.localLinkPatterns ?? []).some((p) => l.includes(p))) return true;
  const ignore = feed.ignoreTags ?? [];
  const tags = entryCategories(item)
    .filter((t) => !ignore.some((ig) => t.toLowerCase().includes(ig)))
    .join(" ");
  const text = `${tags} ${title} ${summary}`.toLowerCase();
  return LOCAL_TERMS.some((term) => text.includes(term));
}

const STOPWORDS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos",
  "nas", "para", "por", "com", "que", "um", "uma", "ao", "os", "as", "é",
  "após", "nesta", "neste", "diz", "sobre",
]);

function titleWords(title) {
  return new Set(
    (title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (w) => !STOPWORDS.has(w) && w.length > 2
    )
  );
}

function titleOverlap(a, b) {
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size);
}

export function sameStory(a, b) {
  return titleOverlap(a, b) >= 0.6;
}

// Mesmo assunto (não necessariamente a mesma matéria): bom para 2ª foto
export function relatedStory(a, b) {
  return titleOverlap(a, b) >= 0.45;
}

// Espelho publicado pelo PC da equipe (tools/mirror_feeds.py): portais como o
// D24AM bloqueiam qualquer IP de datacenter, inclusive o da Vercel
const MIRROR_BASE = "https://raw.githubusercontent.com/Matheuz7k/amazonasemfato-bot/mirror/";

async function fetchFeedXml(url) {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  if (!items.length) throw new Error("sem itens (bloqueio/challenge?)");
  return items;
}

async function fetchFeed(feed) {
  try {
    return await fetchFeedXml(feed.url);
  } catch (direct) {
    try {
      return await fetchFeedXml(`${MIRROR_BASE}${slugify(feed.name)}.xml`);
    } catch {
      throw direct;
    }
  }
}

export async function getNews() {
  const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
  const all = [];

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => ({ feed, items: await fetchFeed(feed) }))
  );
  for (const r of results) {
    if (r.status === "rejected") continue;
    const { feed, items } = r.value;
    for (const item of items.slice(0, 20)) {
      const title = stripHtml(item.title);
      const summary = stripHtml(item.description).slice(0, 500);
      const link = typeof item.link === "string" ? item.link : "";
      const published = item.pubDate ? new Date(item.pubDate) : null;
      if (!published || published.getTime() < cutoff) continue;
      if (title.length < 20) continue;
      const lower = `${title} ${summary}`.toLowerCase();
      if (TITLE_BLOCKLIST.some((t) => lower.includes(t))) continue;
      if (feed.filterLocal && !isLocal(feed, item, title, summary, link)) continue;
      const images = entryImages(item);
      const categories = entryCategories(item);
      all.push({
        source: feed.name,
        title,
        summary,
        link,
        image: images[0] ?? null,
        image2: images[1] ?? null,
        category: detectCategory(link, categories),
        categories,
        resolveLink: feed.resolveLink ?? null,
        published: published.toISOString(),
      });
    }
  }

  all.sort((a, b) => new Date(b.published) - new Date(a.published));

  // Enriquecimento em paralelo: link real do Holanda e miniatura via og:image
  // para quem não manda imagem no RSS (A Crítica, Holanda). Tudo com timeout e
  // cache de 1h — a lista nunca fica esperando um portal lento.
  await Promise.allSettled(
    all.slice(0, 40).map(async (n) => {
      if (n.resolveLink === "holanda") {
        const hit = await resolveHolanda(n.title, n.categories);
        if (hit) {
          n.link = hit.url;
          n.category = detectCategory(hit.url, n.categories);
          if (hit.meta.image && !LOGO_URL_RE.test(hit.meta.image)) n.image = fullSizeImage(hit.meta.image);
          if (!n.summary && hit.meta.description) n.summary = hit.meta.description.slice(0, 500);
        }
        return;
      }
      if (!n.image) {
        const meta = await fetchOgMeta(n.link);
        if (meta.image && !LOGO_URL_RE.test(meta.image)) n.image = fullSizeImage(meta.image);
        if (!n.summary && meta.description) n.summary = meta.description.slice(0, 500);
      }
    })
  );
  for (const n of all) {
    delete n.categories;
    delete n.resolveLink;
  }

  // Remove a mesma história repetida em veículos diferentes — mas aproveita a
  // foto do outro veículo como 2ª imagem (estilo "2 fotos") quando for distinta
  const unique = [];
  for (const c of all) {
    // só entre veículos diferentes: o mesmo portal não repete a própria notícia
    const dup = unique.find((u) => u.source !== c.source && sameStory(u.title, c.title));
    if (!dup) {
      unique.push(c);
      continue;
    }
    if (c.image && !dup.image2 && !sameImage(c.image, dup.image)) {
      dup.image2 = c.image;
      dup.source2 = c.source;
    }
  }
  // 2ª passada, mais permissiva (só para emprestar foto, não para fundir):
  // matéria de outro portal sobre o mesmo assunto nas últimas 24h
  for (const u of unique) {
    if (u.image2) continue;
    const rel = unique.find(
      (o) => o !== u && o.source !== u.source && o.image &&
        !sameImage(o.image, u.image) && relatedStory(u.title, o.title)
    );
    if (rel) {
      u.image2 = rel.image;
      u.source2 = rel.source;
    }
  }
  return unique;
}

const CATEGORY_MAP = [
  [/polici|seguranca|crime/, "POLICIAL"],
  [/economia|emprego|negocio/, "ECONOMIA"],
  [/politica|eleic/, "POLÍTICA"],
  [/esporte|futebol/, "ESPORTE"],
  [/cultura|entretenimento|show|lazer/, "CULTURA"],
  [/educacao|enem|vestibular/, "EDUCAÇÃO"],
  [/saude/, "SAÚDE"],
  [/interior/, "INTERIOR"],
  [/manaus/, "MANAUS"],
  [/amazonas/, "AMAZONAS"],
];

export function detectCategory(link, categories = []) {
  const norm = (s) =>
    String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const haystack = norm(`${link} ${categories.join(" ")}`);
  for (const [re, label] of CATEGORY_MAP) {
    if (re.test(haystack)) return label;
  }
  return "ÚLTIMAS NOTÍCIAS";
}

// Remove sufixo de thumbnail do WordPress (ex.: foto-300x200.jpg → foto.jpg)
export function fullSizeImage(url) {
  return url ? url.replace(/-\d{2,4}x\d{2,4}(\.\w{3,4})$/, "$1") : url;
}

export function buildCaption({ title, summary, source, category }) {
  // O gancho precisa caber nos primeiros ~125 caracteres do feed
  const emoji = CATEGORY_EMOJI[category] ?? "🔴";
  const parts = [`${emoji} ${title}`];
  if (summary && summary.toLowerCase() !== title.toLowerCase()) {
    let s = summary;
    if (s.length > 280) s = s.slice(0, 277).replace(/\s+\S*$/, "") + "…";
    parts.push(s);
  }
  parts.push(`📰 Fonte: ${source}`);
  parts.push("📲 Siga @amazonasemfato para mais notícias do Amazonas!");
  parts.push(HASHTAGS);
  return parts.join("\n\n");
}

const HOLANDA_SECTIONS = [
  "amazonas", "policial", "manaus", "economia", "politica", "mundo", "brasil",
  "esporte", "famosos-tv", "saude", "educacao", "interior",
];

// A seção da URL real nem sempre bate com a tag do RSS: tenta a tag primeiro,
// depois as demais seções em paralelo (tudo cacheado por 1h)
async function resolveHolanda(title, categories) {
  const base = "https://www.portaldoholanda.com.br";
  // O site remove pontuação sem separador ("J&F" → "jf"); testa as duas formas
  const slugs = [...new Set([
    slugify(title),
    slugify(title.replace(/[&'’"“”.,:;!?()]/g, "")),
  ])];
  const tagSection = slugify(categories[0] ?? "");
  const tryUrl = async (section, slug) => {
    const url = `${base}/${section}/${slug}`;
    const meta = await fetchOgMeta(url);
    return meta.ok ? { url, meta } : null;
  };
  if (tagSection) {
    for (const slug of slugs) {
      const hit = await tryUrl(tagSection, slug);
      if (hit) return hit;
    }
  }
  const rest = HOLANDA_SECTIONS.filter((s) => s !== tagSection);
  const results = await Promise.allSettled(
    rest.flatMap((s) => slugs.map((slug) => tryUrl(s, slug)))
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

export function categoryEmoji(category) {
  return CATEGORY_EMOJI[category] ?? "🔴";
}

function matchMeta(html, prop) {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  return m ? stripHtml(m[1]) : null;
}

export async function fetchOgMeta(link) {
  try {
    const resp = await fetch(link, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!resp.ok) return { ok: false, image: null, description: null, video: null, bodyImages: [] };
    const html = await resp.text();
    const image = matchMeta(html, "og:image(?::url)?");
    return {
      ok: true,
      image,
      bodyImages: image ? extractBodyImages(html, image) : [],
      description: matchMeta(html, "og:description") || matchMeta(html, "description"),
      video:
        matchMeta(html, "og:video(?::secure_url|:url)?") ||
        matchMeta(html, "twitter:player:stream") ||
        (/<video[\s>]/i.test(html) ? link : null),
    };
  } catch {
    return { ok: false, image: null, description: null, video: null, bodyImages: [] };
  }
}

/**
 * Fotos adicionais da PRÓPRIA matéria, para o estilo "2 fotos".
 * Segurança editorial: só é chamada em página confirmada (200 + og:image) e
 * olha apenas o bloco do artigo — do <h1> até o primeiro "Leia também" /
 * relacionadas / comentários / rodapé — para nunca pegar foto de outra notícia.
 */
function extractBodyImages(html, ogImage) {
  const start = html.search(/<h1[\s>]/i);
  if (start < 0) return [];
  let block = html.slice(start);
  const stop = block.search(
    /leia\s+tamb[eé]m|leia\s+mais|veja\s+tamb[eé]m|relacionad|mais\s+lidas|coment[aá]rios|<footer|class="[^"]*(related|sidebar|widget)/i
  );
  if (stop > 0) block = block.slice(0, stop);

  const out = [];
  for (const m of block.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = (attrs.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
    if (!src || !/^https?:/.test(src)) continue;
    if (/logo|logotipo|icon|favicon|avatar|banner|publicidade|sprite|emoji|\.svg|\.gif/i.test(src)) continue;
    const w = Number((attrs.match(/\swidth=["']?(\d+)/i) || [])[1] || 9999);
    const h = Number((attrs.match(/\sheight=["']?(\d+)/i) || [])[1] || 9999);
    if (w < 300 || h < 200) continue; // ícone/miniatura
    const full = fullSizeImage(stripHtml(src));
    if (sameImage(full, ogImage) || out.some((u) => sameImage(u, full))) continue;
    out.push(full);
    if (out.length >= 3) break;
  }
  return out;
}

export async function fetchOgImage(link) {
  return (await fetchOgMeta(link)).image;
}
