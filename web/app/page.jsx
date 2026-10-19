import { getNews } from "../lib/news";
import NewsList from "./news-list";

export const revalidate = 300; // atualiza a lista a cada 5 minutos

export default async function Home() {
  const news = await getNews();

  return (
    <main>
      <h1 className="page-title">Últimas do Amazonas</h1>
      <p className="sub">
        Toque em uma notícia para gerar o post pronto — card padronizado +
        legenda com hashtags. A lista se atualiza sozinha.
      </p>
      <NewsList news={news} />
    </main>
  );
}
