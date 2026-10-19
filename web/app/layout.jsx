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
  icons: { icon: "/logo.png" },
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-badge" src="/logo.png" alt="Amazonas Em Fato" />
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
