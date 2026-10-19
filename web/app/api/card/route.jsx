import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { categoryEmoji, fetchOgMeta, sameImage } from "../../../lib/news";

export const runtime = "nodejs";
export const maxDuration = 60;

// 1080x1440 (3:4) — padrão atual do feed/grade do Instagram
const W = 1080;
const H = 1440;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 amazonasemfato-bot";

/**
 * Baixa e normaliza QUALQUER imagem (WebP/AVIF/PNG/EXIF girado/URL instável)
 * para JPEG em data-URI — o renderizador nunca recebe formato que não entende
 * e nunca depende de rede no meio do desenho. Falhou? Retorna null e o card
 * sai com o fundo padrão, nunca quebrado.
 */
async function fetchImageBuffer(url, referer) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9",
      ...(referer ? { Referer: referer } : {}),
    },
    signal: AbortSignal.timeout(15000),
    next: { revalidate: 3600 },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 5000) throw new Error("placeholder"); // pixel de rastreio
  return buf;
}

// Cache em memória da instância: trocar de estilo na mesma notícia não baixa
// nem reprocessa a foto de novo (chave = url + variante)
const IMAGE_CACHE = new Map();
const IMAGE_CACHE_MAX = 40;

// Assinatura visual para detectar a MESMA foto em portais diferentes, mesmo
// com outro recorte/tamanho: histograma de cores 6x6x6 (robusto a recorte) +
// miniatura em cinza (pega cópias idênticas). Calibrado com pares reais:
// mesma cena recortada ≈ 0,90 de interseção; fotos distintas 0,30–0,63.
const SIG_CACHE = new Map();
async function signature(dataUri) {
  if (SIG_CACHE.has(dataUri)) return SIG_CACHE.get(dataUri);
  const buf = Buffer.from(dataUri.split(",")[1], "base64");
  const base = sharp(buf).resize(48, 48, { fit: "cover", position: "centre" });
  const [rgb, grey] = await Promise.all([
    base.clone().removeAlpha().raw().toBuffer(),
    base.clone().resize(12, 12).greyscale().raw().toBuffer(),
  ]);
  const hist = new Float32Array(216);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = (rgb[i] * 6) >> 8, g = (rgb[i + 1] * 6) >> 8, b = (rgb[i + 2] * 6) >> 8;
    hist[r * 36 + g * 6 + b] += 1;
  }
  const total = rgb.length / 3;
  for (let i = 0; i < 216; i++) hist[i] /= total;
  const sig = { hist, grey };
  if (SIG_CACHE.size > 60) SIG_CACHE.delete(SIG_CACHE.keys().next().value);
  SIG_CACHE.set(dataUri, sig);
  return sig;
}

async function looksSame(dataA, dataB) {
  if (!dataA || !dataB) return false;
  const [a, b] = await Promise.all([signature(dataA), signature(dataB)]);
  let inter = 0;
  for (let i = 0; i < 216; i++) inter += Math.min(a.hist[i], b.hist[i]);
  let diff = 0;
  for (let i = 0; i < a.grey.length; i++) diff += Math.abs(a.grey[i] - b.grey[i]);
  return inter > 0.78 || diff / a.grey.length < 14;
}

async function normalizeImage(url, referer, opts = {}) {
  if (!url) return null;
  const key = `${opts.blur ? "blur:" : ""}${url}`;
  if (IMAGE_CACHE.has(key)) return IMAGE_CACHE.get(key);
  const result = await normalizeImageUncached(url, referer, opts);
  if (IMAGE_CACHE.size >= IMAGE_CACHE_MAX) {
    IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value);
  }
  IMAGE_CACHE.set(key, result);
  return result;
}

async function normalizeImageUncached(url, referer, { blur = false } = {}) {
  // Portais (ex.: D24AM) bloqueiam IPs de datacenter — cadeia de resgate:
  // 1) direta  2) proxy do DuckDuckGo (liberado pelos WAFs)  3) weserv
  const attempts = [
    [url, referer],
    [`https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(url)}`, null],
    [`https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1400&output=jpg&q=88`, null],
  ];
  let buf = null;
  for (const [u, ref] of attempts) {
    try {
      buf = await fetchImageBuffer(u, ref);
      break;
    } catch {
      /* tenta a próxima rota */
    }
  }
  if (!buf) return null;
  try {
    // Filtro de qualidade: rejeita logo/arte do portal no lugar de foto real
    // (ex.: Portal do Holanda manda o letreiro do site como imagem padrão)
    if (/logo|logotipo|placeholder|favicon|avatar|brasao|marca-dagua/i.test(url)) {
      return null;
    }
    const probe = sharp(buf, { animated: false }).rotate();
    const meta = await probe.metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    const ratio = w / Math.max(1, h);
    if (w < 320 || h < 300 || ratio > 2.05 || ratio < 0.45) return null; // letreiro/banner/ícone
    const { channels } = await sharp(buf).stats();
    const avgStd = channels.reduce((s, c) => s + c.stdev, 0) / channels.length;
    if (avgStd < 8) return null; // imagem chapada = arte gráfica, não foto

    let pipe = probe
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#111111" }); // PNG transparente → fundo sólido
    if (blur) {
      // variante para quando a matéria só tem 1 foto (2ª metade do estilo duo)
      pipe = pipe.blur(16).modulate({ brightness: 0.8, saturation: 0.9 });
    }
    const out = await pipe.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
const MARGIN = 72;
const RED = "#c61e22";
// Cores reais do X em dark mode ("Lights out")
const X_TEXT = "#e7e9ea";
const X_MUTED = "#71767b";
const X_LINE = "#2f3336";

// Cores reais do X em modo claro
const L_TEXT = "#0f1419";
const L_MUTED = "#536471";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
               "jul", "ago", "set", "out", "nov", "dez"];

function loadFont(file) {
  return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", file));
}

function loadLogo() {
  const p = path.join(process.cwd(), "public", "logo.png");
  if (!fs.existsSync(p)) return null;
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
}

function manausParts(iso) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    // Formato do carimbo real do X em pt-BR: "19:04 · 19 de out de 26"
    xStamp: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${p(d.getUTCDate())} de ${MESES[d.getUTCMonth()]} de ${String(d.getUTCFullYear()).slice(2)}`,
    fullDate: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

// Ícones oficiais do X (viewBox 24x24): responder, repostar, curtir, views, compartilhar
const X_ICONS = [
  "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
  "M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z",
];

function Verified() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" style={{ marginLeft: 10 }}>
      <path
        fill="#1d9bf0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
      />
    </svg>
  );
}

function Avatar({ logo, size = 104 }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        width={size}
        height={size}
        style={{ borderRadius: 999, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: `linear-gradient(145deg, #e03136, ${RED})`,
        color: "#fff",
        fontSize: size * 0.42,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      AF
    </div>
  );
}

function SourceTag({ source }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 22,
        left: 22,
        display: "flex",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontSize: 24,
        fontWeight: 400,
        padding: "8px 18px",
        borderRadius: 999,
      }}
    >
      {`Fonte: ${source}`}
    </div>
  );
}

function LightHeader({ logo, avatarSize = 88 }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Avatar logo={logo} size={avatarSize} />
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 20, flexGrow: 1 }}>
        <div style={{ color: L_TEXT, fontSize: 36, fontWeight: 700 }}>
          Amazonas Em Fato
        </div>
        <div style={{ color: L_MUTED, fontSize: 30, fontWeight: 400 }}>
          @amazonasemfato
        </div>
      </div>
      <div style={{ color: L_MUTED, fontSize: 40, fontWeight: 700, marginBottom: 20 }}>
        ···
      </div>
    </div>
  );
}

// Formato 1: tweet claro no topo, mídia preenchendo o resto até a borda
function LightTopCard({ title, source, img, logo, cat }) {
  const emoji = categoryEmoji(cat);
  const len = title.length;
  const size = len <= 80 ? 48 : len <= 120 ? 44 : len <= 170 ? 40 : 36;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", padding: "40px 44px 36px" }}>
        <LightHeader logo={logo} />
        <div
          style={{
            color: L_TEXT,
            fontSize: size,
            fontWeight: 400,
            lineHeight: 1.32,
            marginTop: 26,
          }}
        >
          {`${emoji} ${title}`}
        </div>
      </div>

      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden", position: "relative" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(160deg, #0d1d33 0%, #15283f 60%, #26101a 100%)",
            }}
          >
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={300} height={300} style={{ borderRadius: 32, opacity: 0.9 }} />
            )}
          </div>
        )}
        </div>
    </div>
  );
}

// Formato 2 (padrão do exemplo): foto inteira, caixa branca larga um pouco
// acima do centro, canto discreto e respiro branco generoso abaixo do texto
function FloatBoxCard({ title, source, img, logo, cat }) {
  const emoji = categoryEmoji(cat);
  const len = title.length;
  const size = len <= 80 ? 44 : len <= 130 ? 40 : 36;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        background: "linear-gradient(160deg, #0d1d33 0%, #15283f 60%, #26101a 100%)",
        fontFamily: "Inter",
      }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          width={W}
          height={H}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: Math.round(H * 0.37),
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 14,
          padding: "32px 36px 72px",
          boxShadow: "0 18px 55px rgba(0,0,0,0.4)",
        }}
      >
        <LightHeader logo={logo} avatarSize={86} />
        <div
          style={{
            color: L_TEXT,
            fontSize: size,
            fontWeight: 400,
            lineHeight: 1.34,
            marginTop: 24,
          }}
        >
          {`${emoji} ${title}`}
        </div>
      </div>

    </div>
  );
}

// Variação do exemplo: duas fotos da pauta empilhadas, caixa cobrindo a emenda
function DuoCard({ title, source, imgTop, imgBottom, logo, cat }) {
  const emoji = categoryEmoji(cat);
  const len = title.length;
  const size = len <= 80 ? 44 : len <= 130 ? 40 : 36;
  const half = H / 2;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "linear-gradient(160deg, #0d1d33 0%, #15283f 60%, #26101a 100%)",
        fontFamily: "Inter",
      }}
    >
      {imgTop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgTop}
          width={W}
          height={half}
          style={{ objectFit: "cover" }}
        />
      )}
      {imgBottom && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgBottom}
          width={W}
          height={half}
          style={{ objectFit: "cover", marginTop: "auto" }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: Math.round(H * 0.37),
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 14,
          padding: "32px 36px 72px",
          boxShadow: "0 18px 55px rgba(0,0,0,0.4)",
        }}
      >
        <LightHeader logo={logo} avatarSize={86} />
        <div
          style={{
            color: L_TEXT,
            fontSize: size,
            fontWeight: 400,
            lineHeight: 1.34,
            marginTop: 24,
          }}
        >
          {`${emoji} ${title}`}
        </div>
      </div>

    </div>
  );
}

function tweetTextSize(title, hasImg) {
  const len = title.length;
  if (!hasImg) {
    // Tweet só de texto renderiza grande no X
    if (len <= 100) return 64;
    if (len <= 160) return 58;
    return 50;
  }
  if (len <= 80) return 54;
  if (len <= 120) return 48;
  if (len <= 170) return 44;
  return 40;
}

function TweetCard({ title, source, img, logo, published }) {
  const { xStamp } = manausParts(published);
  const pad = 44;
  const cardW = W - 2 * 48; // card largo, pouca borda

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "linear-gradient(160deg, #0b0f1a 0%, #141c2e 55%, #26101a 100%)",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          width: cardW,
          display: "flex",
          flexDirection: "column",
          background: "#000000",
          border: `1px solid ${X_LINE}`,
          borderRadius: 24,
          padding: pad,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Cabeçalho do perfil */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <Avatar logo={logo} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ color: X_TEXT, fontSize: 40, fontWeight: 700 }}>
                Amazonas Em Fato
              </div>
              <Verified />
            </div>
            <div style={{ color: X_MUTED, fontSize: 32, fontWeight: 400 }}>
              @amazonasemfato
            </div>
          </div>
        </div>

        {/* Texto da notícia — peso regular, como no X real */}
        <div
          style={{
            color: X_TEXT,
            fontSize: tweetTextSize(title, Boolean(img)),
            fontWeight: 400,
            lineHeight: 1.3,
            marginTop: 32,
          }}
        >
          {title}
        </div>

        {/* Foto da matéria */}
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            width={cardW - 2 * pad}
            height={620}
            style={{
              marginTop: 32,
              borderRadius: 16,
              objectFit: "cover",
              border: `1px solid ${X_LINE}`,
            }}
          />
        )}

        {/* Carimbo de hora no formato do X + crédito */}
        <div
          style={{
            display: "flex",
            color: X_MUTED,
            fontSize: 30,
            fontWeight: 400,
            marginTop: 30,
          }}
        >
          {xStamp}
        </div>

        {/* Divisória + barra de ações do X */}
        <div
          style={{
            height: 1,
            background: X_LINE,
            marginTop: 28,
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 26,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {X_ICONS.map((d, i) => (
            <svg key={i} width="46" height="46" viewBox="0 0 24 24">
              <path fill={X_MUTED} d={d} />
            </svg>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 34,
          color: "#5c6b7a",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        SIGA @AMAZONASEMFATO
      </div>
    </div>
  );
}

function headlineSize(title) {
  const len = title.length;
  if (len <= 60) return 68;
  if (len <= 100) return 58;
  if (len <= 150) return 50;
  return 44;
}

function HeadlineCard({ title, source, img, logo, cat, published }) {
  const { fullDate, time } = manausParts(published);
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "linear-gradient(180deg, #0c1626 0%, #20304a 100%)",
        fontFamily: "Montserrat",
      }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          width={W}
          height={H}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(6,8,12,0.25) 0%, rgba(6,8,12,0.35) 45%, rgba(6,8,12,0.92) 100%)",
        }}
      />

      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          height={110}
          style={{ position: "absolute", top: MARGIN, left: MARGIN }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: MARGIN,
            left: MARGIN,
            display: "flex",
            background: RED,
            color: "#fff",
            fontSize: 34,
            fontWeight: 800,
            padding: "16px 28px",
            borderRadius: 14,
          }}
        >
          AMAZONAS EM FATO
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          bottom: MARGIN,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {cat && (
          <div
            style={{
              display: "flex",
              color: "#ff6b6f",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 4,
              marginBottom: 20,
            }}
          >
            {cat}
          </div>
        )}
        <div
          style={{
            display: "flex",
            borderLeft: `12px solid ${RED}`,
            paddingLeft: 24,
            marginLeft: -36,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: headlineSize(title),
              fontWeight: 800,
              lineHeight: 1.22,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            color: "#cdcdd2",
            fontSize: 30,
            fontWeight: 500,
            marginTop: 36,
          }}
        >
          {`${fullDate} ${time}  •  @amazonasemfato`}
        </div>
      </div>
    </div>
  );
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  let title = (sp.get("title") ?? "").trim();
  const source = sp.get("source") ?? "";
  const published = sp.get("published") ?? new Date().toISOString();
  const cat = sp.get("cat") ?? "";
  const style = sp.get("style") ?? "tweet";
  const link = sp.get("link");

  // Título gigante não pode engolir a área da foto
  if (title.length > 200) {
    title = title.slice(0, 197).replace(/\s+\S*$/, "") + "…";
  }

  // og:image é a foto editorial em alta — preferir; se falhar ou for logo do
  // portal, tenta as próximas candidatas. Tudo passa pelo normalizador
  // (WebP/AVIF/EXIF → JPEG inline, filtro anti-logo, à prova de bug).
  // SÓ imagens declaradas pela própria matéria (og:image + RSS). Garimpar o
  // corpo da página é proibido: sites servem página de erro/relacionadas para
  // bots e a foto sairia de OUTRA notícia — inaceitável em página de notícias.
  // Em paralelo: og:image da matéria e a imagem do feed já normalizada
  const [meta, feedImg] = await Promise.all([
    link ? fetchOgMeta(link) : Promise.resolve({ image: null }),
    normalizeImage(sp.get("img"), link),
  ]);
  const candidates = [
    ...new Set([meta.image, sp.get("img"), sp.get("img2")].filter(Boolean)),
  ];
  let img = null;
  let usedUrl = null;
  for (const u of candidates) {
    img = u === sp.get("img") ? feedImg : await normalizeImage(u, link);
    if (img) {
      usedUrl = u;
      break;
    }
  }

  // Estilo duo: 2ª foto DIFERENTE — do outro veículo que cobriu a mesma
  // notícia (img2) ou do corpo da própria matéria; só existe uma → desfocada
  let imgBottom = null;
  let duoMode = "none"; // "two-sources" | "body" | "none"
  if (style === "duo") {
    const seconds = [
      ...new Set([sp.get("img2"), ...(meta.bodyImages ?? [])].filter(Boolean)),
    ].filter((u) => !sameImage(u, usedUrl));
    for (const u of seconds) {
      const candidate = await normalizeImage(u, link);
      // mesma foto de assessoria em dois portais → não serve como 2ª foto
      if (!candidate || (await looksSame(img, candidate))) continue;
      imgBottom = candidate;
      duoMode = u === sp.get("img2") && sp.get("src2") ? "two-sources" : "body";
      break;
    }
    // Sem 2ª foto REAL e diferente → não existe "2 fotos" para esta notícia:
    // renderiza o formato de 1 foto (faixa) e avisa a tela (X-Duo: none).
    // Nunca foto repetida, nunca foto de acervo sem relação com a notícia.
  }
  const effectiveStyle = style === "duo" && !imgBottom ? "faixa" : style;

  const logo = loadLogo();
  // Sem crédito impresso no card (pedido da página): a fonte vai na legenda.
  const props = { title, source, img, logo, cat, published };

  const card =
    effectiveStyle === "manchete" ? <HeadlineCard {...props} />
    : effectiveStyle === "faixa" ? <FloatBoxCard {...props} />
    : effectiveStyle === "duo" ? <DuoCard {...props} imgTop={img} imgBottom={imgBottom} />
    : effectiveStyle === "dark" ? <TweetCard {...props} />
    : <LightTopCard {...props} />;

  return new ImageResponse(
    card,
    {
      width: W,
      height: H,
      emoji: "twemoji",
      headers: {
        // O card é determinístico pelos parâmetros → cache forte na CDN
        "Cache-Control": "public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800",
        "X-Duo": duoMode,
        "X-Has-Photo": img ? "1" : "0",
        "Access-Control-Expose-Headers": "X-Duo, X-Has-Photo",
      },
      fonts: [
        // Inter ≈ Chirp (fonte real do X) para o card tweet
        { name: "Inter", data: loadFont("Inter-Regular.ttf"), weight: 400 },
        { name: "Inter", data: loadFont("Inter-Bold.ttf"), weight: 700 },
        { name: "Inter", data: loadFont("Inter-ExtraBold.ttf"), weight: 800 },
        // Montserrat para o card manchete
        { name: "Montserrat", data: loadFont("Montserrat-Medium.ttf"), weight: 500 },
        { name: "Montserrat", data: loadFont("Montserrat-ExtraBold.ttf"), weight: 800 },
      ],
    }
  );
}
