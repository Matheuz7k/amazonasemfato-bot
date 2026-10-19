"use client";

import { useState } from "react";

export default function Actions({ cardUrl, caption }) {
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
        {copied ? "✓ Legenda copiada!" : "Copiar legenda"}
      </button>
      <button className="btn secondary" onClick={baixar} disabled={downloading}>
        {downloading ? "Baixando…" : "Baixar imagem"}
      </button>
      <textarea readOnly value={caption} />
    </>
  );
}
