import { ImageResponse } from "next/og";
import { SEO_DEFAULT_DESCRIPTION, SEO_SITE_NAME } from "@/lib/seo";

export const alt = `${SEO_SITE_NAME} Preview`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 10% 20%, #34d399 0%, #22d3ee 35%, #0f172a 100%)",
          color: "#f8fafc",
          padding: "64px",
          fontFamily: "serif",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 30,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            opacity: 0.9,
          }}
        >
          Screening ALR
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.08 }}>{SEO_SITE_NAME}</div>
          <div style={{ fontSize: 34, maxWidth: "90%", opacity: 0.95 }}>
            {SEO_DEFAULT_DESCRIPTION}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>
          AI Screening • BibTeX • Full-Text Analysis
        </div>
      </div>
    ),
    size,
  );
}
