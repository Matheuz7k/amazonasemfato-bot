import Link from "next/link";
import { buildCaption, fetchOgMeta } from "../../lib/news";
import CardPanel from "./ui";

const STYLES = [
  ["tweet", "💬 Tweet + mídia"],
  ["faixa", "🖼️ Faixa no meio"],
  ["duo", "🏙️ 2 fotos"],
  ["dark", "🌙 Tweet escuro"],
  ["manchete", "🗞️ Manchete"],
];

export default async function Gerar({ searchParams }) {
  const sp = await searchParams;
  const { title, summary = "", source, link = "", published, img = "", img2 = "", src2 = "", cat = "", style = "tweet" } = sp;

  if (!title || !source) {
    return (
      <main>
        <Link className="back" href="/">← voltar</Link>
        <p className="sub">Notícia inválida — volte e escolha de novo.</p>
      </main>
    );
  }

  const caption = buildCaption({ title, summary, source, category: cat });
  const meta = link ? await fetchOgMeta(link) : { video: null };
  const cardParams = new URLSearchParams({
    title,
    source,
    style,
    v: "7", // versão do renderizador — muda a chave de cache da CDN
    published: published ?? new Date().toISOString(),
    ...(cat ? { cat } : {}),
    ...(img ? { img } : {}),
    ...(img2 ? { img2 } : {}),
    ...(src2 ? { src2 } : {}),
    ...(link ? { link } : {}),
  });
  const cardUrl = `/api/card?${cardParams.toString()}`;

  // Pré-carrega os outros estilos depois do principal: trocar de chip é instantâneo
  const prefetch = STYLES.filter(([k]) => k !== style).map(([k]) => {
    const p = new URLSearchParams(cardParams);
    p.set("style", k);
    return `/api/card?${p.toString()}`;
  });

  const styleLink = (s) => {
    const p = new URLSearchParams({ ...sp, style: s });
    return `/gerar?${p.toString()}`;
  };

  return (
    <main className="gerar-main">
      <Link className="back" href="/">← voltar para a lista</Link>

      <div className="styles">
        {STYLES.map(([key, label]) => (
          <Link
            key={key}
            className={`chip ${style === key ? "active" : ""}`}
            href={styleLink(key)}
            replace
          >
            {label}
          </Link>
        ))}
      </div>

      <CardPanel
        key={style}
        cardUrl={cardUrl}
        caption={caption}
        prefetch={prefetch}
        style={style}
        src2={src2}
      />

      {meta.video && (
        <a
          className="btn secondary"
          href={meta.video}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: 10 }}
        >
          🎥 Esta matéria tem vídeo — abrir na fonte
        </a>
      )}

      {link && (
        <a className="source-link" href={link} target="_blank" rel="noopener noreferrer">
          Abrir matéria original em {source} ↗
        </a>
      )}
    </main>
  );
}
