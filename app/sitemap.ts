import type { MetadataRoute } from "next";
import { seoMetadataBase } from "@/lib/seo";

function resolveAbsoluteUrl(path: string): string {
  const normalizedPath = path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, seoMetadataBase).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: resolveAbsoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
