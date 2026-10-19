"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function relativeTime(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h${mins % 60 ? ` ${mins % 60}min` : ""}`;
  return `há ${Math.floor(hours / 24)}d`;
}

export default function NewsList({ news }) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Todas");

  const sources = useMemo(
    () => ["Todas", ...new Set(news.map((n) => n.source))],
    [news]
  );

  const visible = news.filter((n) => {
    if (sourceFilter !== "Todas" && n.source !== sourceFilter) return false;
    if (!query) return true;
    return `${n.title} ${n.summary}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <>
      <input
        className="search"
        type="search"
        placeholder="Buscar notícia…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="filters">
        {sources.map((s) => (
          <button
            key={s}
            className={`chip ${sourceFilter === s ? "active" : ""}`}
            onClick={() => setSourceFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="empty">
          Nenhuma notícia encontrada.
          {query ? " Tente outra busca." : " Volte em alguns minutos."}
        </p>
      )}

      <div className="grid">
      {visible.map((n) => {
        const params = new URLSearchParams({
          title: n.title,
          summary: n.summary,
          source: n.source,
          link: n.link,
          published: n.published,
          cat: n.category,
          ...(n.image ? { img: n.image } : {}),
          ...(n.image2 ? { img2: n.image2 } : {}),
          ...(n.source2 ? { src2: n.source2 } : {}),
        });
        const isNew = Date.now() - new Date(n.published) < 3600 * 1000;
        return (
          <Link key={n.link} href={`/gerar?${params.toString()}`}>
            <div className="item">
              {n.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.image} alt="" loading="lazy" />
              ) : (
                <div className="noimg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="" />
                </div>
              )}
              <div>
                <h2>{n.title}</h2>
                <div className="meta">
                  <span className="cat">{n.category}</span>
                  <span>{n.source}</span>
                  <span>•</span>
                  <span>{relativeTime(n.published)}</span>
                  {isNew && <span className="badge-novo">NOVO</span>}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
      </div>
    </>
  );
}
