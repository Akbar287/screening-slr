import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Environment variable ${name} belum diatur.`);
  }

  return value;
}

export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function resolvePublicBaseUrl(requestOrigin?: string | null): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL ||
    null;

  const candidate = (configured || requestOrigin || "").trim();

  if (!candidate) {
    return "http://localhost:3000";
  }

  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

