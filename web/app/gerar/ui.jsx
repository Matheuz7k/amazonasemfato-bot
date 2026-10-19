"use client";

import { useEffect, useRef, useState } from "react";

const DUO_NOTES = {
  "two-sources": (src2) => `📸 Duas fotos reais: a de baixo é de ${src2}, que também cobriu esta notícia.`,
  body: () => "📸 Duas fotos reais, ambas da própria matéria.",
  stock: () =>
    "📸 A matéria só tem uma foto — a 2ª é ilustrativa, do acervo de Manaus/Amazonas (crédito no card).",
  blur: () =>
    "ℹ️ Só existe uma foto desta notícia — a metade de baixo usa a mesma foto desfocada. Experimente outro estilo.",
};

export default function CardPanel({ cardUrl, caption, prefetch = [], style, src2 }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const blobRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setNote(null);
    setError(false);
    fetch(cardUrl)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        if (cancelled) return;
        blobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        if (style === "duo") {
          const mode = resp.headers.get("x-duo");
          if (DUO_NOTES[mode]) setNote(DUO_NOTES[mode](src2));
        } else if (resp.headers.get("x-has-photo") === "0") {
          setNote("ℹ️ Esta matéria não tem foto disponível — o card saiu com o fundo da marca.");
        }
        // aquece os outros estilos em segundo plano (cache da CDN + da instância)
        for (const url of prefetch) {
          const im = new Image();
          im.src = url;
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [cardUrl, style, src2, prefetch]);

  async function copiar() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function baixar() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "post-amazonasemfato.png";
    a.click();
  }

  return (
    <>
      <div className="preview-wrap">
        {!blobUrl && !error && (
          <div className="skeleton">
            <span>🎨 Gerando seu card…</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>
              buscando a foto em alta da matéria
            </span>
          </div>
        )}
        {error && (
          <div className="skeleton" style={{ animation: "none" }}>
            <span>😕 Não consegui gerar este card</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>
              tente outro estilo ou recarregue a página
            </span>
          </div>
        )}
        {blobUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blobUrl} alt="Card do post" />
        )}
      </div>

      {note && <p className="note">{note}</p>}

      <button className={`btn ${copied ? "ok" : ""}`} onClick={copiar}>
        {copied ? "✓ Legenda copiada!" : "📋 Copiar legenda"}
      </button>
      <button className="btn secondary" onClick={baixar} disabled={!blobUrl}>
        {blobUrl ? "⬇️ Baixar imagem" : "Preparando imagem…"}
      </button>
      <textarea readOnly value={caption} />
    </>
  );
}
