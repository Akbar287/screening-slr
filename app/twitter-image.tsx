import { ImageResponse } from "next/og";
import { SEO_SITE_NAME } from "@/lib/seo";

export const alt = `${SEO_SITE_NAME} Twitter Card`;
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f172a 0%, #0ea5e9 60%, #67e8f9 100%)",
          color: "#f8fafc",
          padding: "56px",
          fontFamily: "serif",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.95,
          }}
        >
          Systematic Literature Review
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.08 }}>{SEO_SITE_NAME}</div>
          <div style={{ fontSize: 30, opacity: 0.9 }}>
            Kelola Criteria, BibTeX, Abstract, dan Full-Text Screening
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 24, opacity: 0.85 }}>
          Included vs Excluded • Justifikasi • AI Assistance
        </div>
      </div>
    ),
    size,
  );
}
