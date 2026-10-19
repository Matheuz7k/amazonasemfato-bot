import Link from "next/link";
import { getNews } from "../lib/news";

export const revalidate = 300; // atualiza a lista a cada 5 minutos

const MANAUS_OFFSET_MS = -4 * 3600 * 1000;

function manausTime(iso) {
  const d = new Date(new Date(iso).getTime() + MANAUS_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} às ${hh}:${mi}`;
}

export default async function Home() {
  const news = await getNews();

  return (
    <main>
      <h1>📰 Studio @amazonasemfato</h1>
      <p className="sub">
        Últimas notícias do Amazonas — toque em uma para gerar o post pronto
        (card + legenda). Lista atualizada automaticamente.
      </p>

      {news.length === 0 && (
        <p className="sub">
          Nenhuma notícia recente encontrada agora. Tente de novo em alguns
          minutos.
        </p>
      )}

      {news.map((n) => {
        const params = new URLSearchParams({
          title: n.title,
          summary: n.summary,
          source: n.source,
          link: n.link,
          published: n.published,
          cat: n.category,
          ...(n.image ? { img: n.image } : {}),
        });
        return (
          <Link key={n.link} href={`/gerar?${params.toString()}`}>
            <div className="item">
              {n.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.image} alt="" loading="lazy" />
              ) : (
                <div className="noimg">📰</div>
              )}
              <div>
                <h2>{n.title}</h2>
                <div className="meta">
                  <span className="cat">{n.category}</span> {n.source} •{" "}
                  {manausTime(n.published)}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </main>
  );
}
