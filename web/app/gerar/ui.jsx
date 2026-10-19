"use client";

import { useState } from "react";

export function Preview({ cardUrl, prefetch = [] }) {
  const [loaded, setLoaded] = useState(false);

  function onLoad() {
    setLoaded(true);
    // aquece os outros estilos em segundo plano (cache da CDN + da instância)
    for (const url of prefetch) {
      const im = new Image();
      im.src = url;
    }
  }

  return (
    <div className="preview-wrap">
      {!loaded && (
        <div className="skeleton">
          <span>🎨 Gerando seu card…</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>
            buscando a foto em alta da matéria
          </span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cardUrl}
        alt="Card do post"
        onLoad={onLoad}
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.3s" }}
      />
    </div>
  );
}

export function Actions({ cardUrl, caption }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function baixar() {
    setDownloading(true);
    try {
      const resp = await fetch(cardUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "post-amazonasemfato.png";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button className={`btn ${copied ? "ok" : ""}`} onClick={copiar}>
        {copied ? "✓ Legenda copiada!" : "📋 Copiar legenda"}
      </button>
      <button className="btn secondary" onClick={baixar} disabled={downloading}>
        {downloading ? "Baixando…" : "⬇️ Baixar imagem"}
      </button>
      <textarea readOnly value={caption} />
    </>
  );
}
