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
  { name: "Portal do Holanda", url: "https://www.portaldoholanda.com.br/feed", filterLocal: true },
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

export function sameStory(a, b) {
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.size || !wb.size) return false;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size) >= 0.6;
}

async function fetchFeed(feed) {
  const resp = await fetch(feed.url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 300 },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  return asArray(doc?.rss?.channel?.item);
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
      all.push({
        source: feed.name,
        title,
        summary,
        link,
        image: images[0] ?? null,
        image2: images[1] ?? null,
        category: detectCategory(link, entryCategories(item)),
        published: published.toISOString(),
      });
    }
  }

  all.sort((a, b) => new Date(b.published) - new Date(a.published));

  // Remove a mesma história repetida em veículos diferentes
  const unique = [];
  for (const c of all) {
    if (!unique.some((u) => sameStory(u.title, c.title))) unique.push(c);
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
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 3600 },
    });
    const html = await resp.text();
    // Fotos do corpo da matéria — resgate quando o og:image é o logo do portal
    const bodyImages = [];
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      const u = stripHtml(m[1]);
      if (!/^https?:/.test(u)) continue;
      if (/logo|logotipo|icon|favicon|avatar|banner|publicidade|sprite|\.svg/i.test(u)) continue;
      if (!bodyImages.includes(u)) bodyImages.push(u);
      if (bodyImages.length >= 3) break;
    }
    return {
      image: matchMeta(html, "og:image(?::url)?"),
      images: bodyImages,
      video:
        matchMeta(html, "og:video(?::secure_url|:url)?") ||
        matchMeta(html, "twitter:player:stream") ||
        (/<video[\s>]/i.test(html) ? link : null),
    };
  } catch {
    return { image: null, images: [], video: null };
  }
}

export async function fetchOgImage(link) {
  return (await fetchOgMeta(link)).image;
}
