import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";
import { fetchOgImage } from "../../../lib/news";

export const runtime = "nodejs";

const W = 1080;
const H = 1350;
const MARGIN = 72;
const RED = "#c61e22";
const TWEET_BG = "#15202b";
const TWEET_MUTED = "#8899a6";

function loadFont(file) {
  return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", file));
}

function loadLogo() {
  const p = path.join(process.cwd(), "public", "logo.png");
  if (!fs.existsSync(p)) return null;
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
}

function manausParts(iso) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`,
    fullDate: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

function Verified() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" style={{ marginLeft: 10 }}>
      <path
        fill="#1d9bf0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
      />
    </svg>
  );
}

function Avatar({ logo }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        width={96}
        height={96}
        style={{ borderRadius: 999, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: 999,
        background: RED,
        color: "#fff",
        fontSize: 40,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      AF
    </div>
  );
}

function tweetTextSize(title) {
  const len = title.length;
  if (len <= 80) return 50;
  if (len <= 120) return 46;
  if (len <= 170) return 42;
  return 38;
}

function TweetCard({ title, source, img, logo, published }) {
  const { date, time } = manausParts(published);
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "linear-gradient(160deg, #0b0f1a 0%, #141c2e 55%, #26101a 100%)",
        fontFamily: "Montserrat",
      }}
    >
      <div
        style={{
          width: W - 2 * MARGIN,
          display: "flex",
          flexDirection: "column",
          background: TWEET_BG,
          borderRadius: 28,
          padding: 44,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Cabeçalho do perfil */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <Avatar logo={logo} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ color: "#fff", fontSize: 38, fontWeight: 800 }}>
                Amazonas Em Fato
              </div>
              <Verified />
            </div>
            <div style={{ color: TWEET_MUTED, fontSize: 30, fontWeight: 500 }}>
              @amazonasemfato
            </div>
          </div>
        </div>

        {/* Texto da notícia */}
        <div
          style={{
            color: "#f7f9f9",
            fontSize: tweetTextSize(title),
            fontWeight: 600,
            lineHeight: 1.3,
            marginTop: 34,
          }}
        >
          {title}
        </div>

        {/* Foto da matéria */}
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            width={W - 2 * MARGIN - 88}
            height={470}
            style={{
              marginTop: 34,
              borderRadius: 24,
              objectFit: "cover",
              border: "1px solid #38444d",
            }}
          />
        )}

        {/* Rodapé do tweet */}
        <div
          style={{
            display: "flex",
            color: TWEET_MUTED,
            fontSize: 28,
            fontWeight: 500,
            marginTop: 34,
          }}
        >
          {`${time} · ${date} · Fonte: ${source}`}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          color: "#5c6b7a",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        SIGA @AMAZONASEMFATO
      </div>
    </div>
  );
}

function headlineSize(title) {
  const len = title.length;
  if (len <= 60) return 68;
  if (len <= 100) return 58;
  if (len <= 150) return 50;
  return 44;
}

function HeadlineCard({ title, source, img, logo, cat, published }) {
  const { fullDate, time } = manausParts(published);
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "linear-gradient(180deg, #0c1626 0%, #20304a 100%)",
        fontFamily: "Montserrat",
      }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          width={W}
          height={H}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(6,8,12,0.25) 0%, rgba(6,8,12,0.35) 45%, rgba(6,8,12,0.92) 100%)",
        }}
      />

      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          height={110}
          style={{ position: "absolute", top: MARGIN, left: MARGIN }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: MARGIN,
            left: MARGIN,
            display: "flex",
            background: RED,
            color: "#fff",
            fontSize: 34,
            fontWeight: 800,
            padding: "16px 28px",
            borderRadius: 14,
          }}
        >
          AMAZONAS EM FATO
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: MARGIN,
          right: MARGIN,
          bottom: MARGIN,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {cat && (
          <div
            style={{
              display: "flex",
              color: "#ff6b6f",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 4,
              marginBottom: 20,
            }}
          >
            {cat}
          </div>
        )}
        <div
          style={{
            display: "flex",
            borderLeft: `12px solid ${RED}`,
            paddingLeft: 24,
            marginLeft: -36,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: headlineSize(title),
              fontWeight: 800,
              lineHeight: 1.22,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            color: "#cdcdd2",
            fontSize: 30,
            fontWeight: 500,
            marginTop: 36,
          }}
        >
          {`Fonte: ${source}  •  ${fullDate} ${time}  •  @amazonasemfato`}
        </div>
      </div>
    </div>
  );
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const title = sp.get("title") ?? "";
  const source = sp.get("source") ?? "";
  const published = sp.get("published") ?? new Date().toISOString();
  const cat = sp.get("cat") ?? "";
  const style = sp.get("style") ?? "tweet";
  const link = sp.get("link");
  // og:image é a foto editorial em alta resolução — preferir sempre que houver
  const img = (link ? await fetchOgImage(link) : null) ?? sp.get("img");

  const logo = loadLogo();
  const props = { title, source, img, logo, cat, published };

  return new ImageResponse(
    style === "manchete" ? <HeadlineCard {...props} /> : <TweetCard {...props} />,
    {
      width: W,
      height: H,
      fonts: [
        { name: "Montserrat", data: loadFont("Montserrat-Medium.ttf"), weight: 500 },
        { name: "Montserrat", data: loadFont("Montserrat-Bold.ttf"), weight: 600 },
        { name: "Montserrat", data: loadFont("Montserrat-ExtraBold.ttf"), weight: 800 },
      ],
    }
  );
}
