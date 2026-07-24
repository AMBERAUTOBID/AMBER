import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#1a1817",
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(195,102,36,0.35), transparent 55%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 14,
              height: 56,
              borderRadius: 7,
              backgroundColor: "#c36624",
              display: "flex",
            }}
          />
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: "#ffffff" }}>
            Smart<span style={{ color: "#dc8641" }}>AutoBid</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 34,
            lineHeight: 1.4,
            color: "#d5d3d0",
            maxWidth: 920,
          }}
        >
          Bid, buy &amp; ship cars from Copart and IAAI auctions to Europe.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 64,
            fontSize: 24,
            color: "#8a8581",
            letterSpacing: 1,
          }}
        >
          smartautobid.com
        </div>
      </div>
    ),
    { ...size }
  );
}
