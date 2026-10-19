import Link from "next/link";
import { buildCaption } from "../../lib/news";
import { Actions, Preview } from "./ui";

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
  const cardParams = new URLSearchParams({
    title,
    source,
    style,
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
        <Link
          className={`chip ${style === "tweet" ? "active" : ""}`}
          href={styleLink("tweet")}
          replace
        >
          💬 Estilo tweet
        </Link>
        <Link
          className={`chip ${style === "manchete" ? "active" : ""}`}
          href={styleLink("manchete")}
          replace
        >
          🗞️ Estilo manchete
        </Link>
      </div>

      <Preview key={style} cardUrl={cardUrl} />
      <Actions cardUrl={cardUrl} caption={caption} />

      {link && (
        <a className="source-link" href={link} target="_blank" rel="noopener noreferrer">
          Abrir matéria original em {source} ↗
        </a>
      )}
    </main>
  );
}
