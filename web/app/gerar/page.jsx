import Link from "next/link";
import { buildCaption, fetchOgMeta } from "../../lib/news";
import { Actions, Preview } from "./ui";

const STYLES = [
  ["tweet", "💬 Tweet + mídia"],
  ["faixa", "🖼️ Faixa no meio"],
  ["dark", "🌙 Tweet escuro"],
  ["manchete", "🗞️ Manchete"],
];

export default async function Gerar({ searchParams }) {
  const sp = await searchParams;
  const { title, summary = "", source, link = "", published, img = "", cat = "", style = "tweet" } = sp;

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
    v: "3", // versão do renderizador — muda a chave de cache da CDN
    published: published ?? new Date().toISOString(),
    ...(cat ? { cat } : {}),
    ...(img ? { img } : {}),
    ...(link ? { link } : {}),
  });
  const cardUrl = `/api/card?${cardParams.toString()}`;

  const styleLink = (s) => {
    const p = new URLSearchParams({ ...sp, style: s });
    return `/gerar?${p.toString()}`;
  };

  return (
    <main>
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

      <Preview key={style} cardUrl={cardUrl} />
      <Actions cardUrl={cardUrl} caption={caption} />

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
