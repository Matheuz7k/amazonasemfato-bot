import Link from "next/link";
import { buildCaption } from "../../lib/news";
import Actions from "./ui";

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

  const caption = buildCaption({ title, summary, source });
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
        >
          Estilo tweet
        </Link>
        <Link
          className={`chip ${style === "manchete" ? "active" : ""}`}
          href={styleLink("manchete")}
        >
          Estilo manchete
        </Link>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="card-preview" src={cardUrl} alt="Card do post" />
      <Actions cardUrl={cardUrl} caption={caption} />
    </main>
  );
}
