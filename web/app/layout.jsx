import localFont from "next/font/local";
import "./globals.css";

const montserrat = localFont({
  src: [
    { path: "../assets/fonts/Montserrat-Medium.ttf", weight: "500" },
    { path: "../assets/fonts/Montserrat-Bold.ttf", weight: "700" },
    { path: "../assets/fonts/Montserrat-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  title: "Studio — @amazonasemfato",
  description: "Gere posts prontos com as últimas notícias do Amazonas",
  robots: { index: false },
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23c61e22"/><text x="50" y="66" font-size="44" font-weight="bold" font-family="Arial" fill="white" text-anchor="middle">AF</text></svg>'
      ),
  },
};

export const viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand-badge">AF</div>
            <div>
              <div className="brand-name">Amazonas Em Fato</div>
              <div className="brand-sub">Studio de posts</div>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
