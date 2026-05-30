import type { Metadata } from "next";

export const SEO_SITE_NAME = "SLR Screening Platform";
export const SEO_SITE_AUTHOR_NAME = "Muhammad Akbar";
export const SEO_SITE_AUTHOR_URL =
  "https://www.linkedin.com/in/muhammad-akbar-596803201/";
export const SEO_DEFAULT_OG_IMAGE_PATH = "/opengraph-image";
export const SEO_DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image";
export const SEO_DEFAULT_DESCRIPTION =
  "Platform screening untuk Systematic Literature Review: kelola reference, kriteria, analisa AI, dan full-text screening.";
export const SEO_DEFAULT_KEYWORDS = [
  "systematic literature review",
  "SLR",
  "screening referensi",
  "bibtex",
  "criteria screening",
  "full-text analysis",
  "next.js",
];

function resolveMetadataBase(): URL {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL ||
    null;

  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      // Fall back to other candidates below.
    }
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    try {
      return new URL(`https://${vercelUrl}`);
    } catch {
      // Fall back below.
    }
  }

  return new URL("http://localhost:3000");
}

function normalizePath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function mergeKeywords(extraKeywords: string[] = []): string[] {
  return Array.from(new Set([...SEO_DEFAULT_KEYWORDS, ...extraKeywords]));
}

export const seoMetadataBase = resolveMetadataBase();

export function createRootMetadata(): Metadata {
  const homeUrl = new URL("/", seoMetadataBase).toString();

  return {
    metadataBase: seoMetadataBase,
    applicationName: SEO_SITE_NAME,
    title: {
      default: SEO_SITE_NAME,
      template: `%s | ${SEO_SITE_NAME}`,
    },
    description: SEO_DEFAULT_DESCRIPTION,
    keywords: mergeKeywords(),
    authors: [
      {
        name: SEO_SITE_AUTHOR_NAME,
        url: SEO_SITE_AUTHOR_URL,
      },
    ],
    creator: SEO_SITE_AUTHOR_NAME,
    publisher: SEO_SITE_AUTHOR_NAME,
    category: "education",
    alternates: {
      canonical: "/",
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        noimageindex: false,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "id_ID",
      siteName: SEO_SITE_NAME,
      url: homeUrl,
      title: SEO_SITE_NAME,
      description: SEO_DEFAULT_DESCRIPTION,
      images: [SEO_DEFAULT_OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title: SEO_SITE_NAME,
      description: SEO_DEFAULT_DESCRIPTION,
      images: [SEO_DEFAULT_TWITTER_IMAGE_PATH],
    },
  };
}

export function createPageMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
}): Metadata {
  const normalizedPath = normalizePath(path);
  const isAbsolutePath = /^https?:\/\//i.test(normalizedPath);
  const pageUrl = isAbsolutePath
    ? normalizedPath
    : new URL(normalizedPath, seoMetadataBase).toString();

  return {
    title,
    description,
    keywords: mergeKeywords(keywords),
    alternates: {
      canonical: isAbsolutePath ? pageUrl : normalizedPath,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            "max-video-preview": -1,
            "max-image-preview": "none",
            "max-snippet": -1,
          },
        }
      : {
          index: true,
          follow: true,
          nocache: false,
          googleBot: {
            index: true,
            follow: true,
            noimageindex: false,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
    openGraph: {
      type: "website",
      locale: "id_ID",
      siteName: SEO_SITE_NAME,
      url: pageUrl,
      title,
      description,
      images: [SEO_DEFAULT_OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SEO_DEFAULT_TWITTER_IMAGE_PATH],
    },
  };
}
