import "./globals.css";

export const metadata = {
  title: "Studio — @amazonasemfato",
  description: "Gere posts prontos com as últimas notícias do Amazonas",
  robots: { index: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
