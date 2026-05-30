import type { MetadataRoute } from "next";
import { seoMetadataBase } from "@/lib/seo";

function resolveBaseUrl(): string {
  return seoMetadataBase.toString().replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/references",
          "/criteria",
          "/analysis-results",
          "/screening",
          "/full-text-screening",
          "/upload-file",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
