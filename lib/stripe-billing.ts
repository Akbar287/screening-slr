import type Stripe from "stripe";
import { PaymentStatus, type Plan } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient, resolvePublicBaseUrl } from "@/lib/stripe";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

function normalizeCurrency(value: string): string {
  return value.trim().toLowerCase();
}

function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency);
}

function toMinorAmount(priceText: string, currency: string): number {
  const major = Number.parseFloat(priceText);

  if (!Number.isFinite(major) || major < 0) {
    throw new Error("Harga plan tidak valid untuk pembayaran.");
  }

  if (isZeroDecimalCurrency(currency)) {
    return Math.round(major);
  }

  return Math.round(major * 100);
}

type RecurringConfig = {
  interval: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval;
  intervalCount?: number;
};

function resolveRecurringConfig(billingInterval: string): RecurringConfig {
  const interval = billingInterval.trim().toLowerCase();

  if (interval === "yearly" || interval === "annual" || interval === "annually" || interval === "year") {
    return { interval: "year" };
  }

  if (interval === "weekly" || interval === "week") {
    return { interval: "week" };
  }

  if (interval === "daily" || interval === "day") {
    return { interval: "day" };
  }

  if (interval === "quarterly" || interval === "quarter") {
    return { interval: "month", intervalCount: 3 };
  }

  return { interval: "month" };
}

function normalizeTrialDays(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);

  if (rounded <= 0) {
    return null;
  }

  return Math.min(rounded, 730);
}

function buildPlanCheckoutMetadata(params: {
  userId: bigint;
  planId: bigint;
  subscriptionId: bigint;
  paymentId: bigint;
}): Record<string, string> {
  return {
    userId: params.userId.toString(),
    planId: params.planId.toString(),
    subscriptionId: params.subscriptionId.toString(),
    paymentId: params.paymentId.toString(),
  };
}

type CreateCheckoutSessionParams = {
  userId: bigint;
  subscriptionId: bigint;
  plan: Plan;
  requestOrigin?: string | null;
};

type CreateCheckoutSessionResult = {
  checkoutUrl: string;
  sessionId: string;
  paymentId: bigint;
};

export async function createStripeCheckoutForPlan({
  userId,
  subscriptionId,
  plan,
  requestOrigin,
}: CreateCheckoutSessionParams): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripeClient();
  const currency = normalizeCurrency(plan.currency);
  const amount = toMinorAmount(plan.price.toString(), currency);
  const recurringConfig = resolveRecurringConfig(plan.billingInterval);
  const trialDays = normalizeTrialDays(plan.trialDays);

  if (amount <= 0) {
    throw new Error("Plan ini tidak memerlukan pembayaran.");
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      subscriptionId,
      amount,
      currency,
      status: PaymentStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  const metadata = buildPlanCheckoutMetadata({
    userId,
    planId: plan.id,
    subscriptionId,
    paymentId: payment.id,
  });

  const baseUrl = resolvePublicBaseUrl(requestOrigin);

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      client_reference_id: subscriptionId.toString(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            recurring: {
              interval: recurringConfig.interval,
              ...(recurringConfig.intervalCount && recurringConfig.intervalCount > 1
                ? { interval_count: recurringConfig.intervalCount }
                : {}),
            },
            product_data: {
              name: `Plan ${plan.name}`,
              description: plan.description,
            },
          },
        },
      ],
      metadata,
      subscription_data: {
        metadata,
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      success_url: `${baseUrl}/?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?subscription=canceled`,
    });
  } catch (error) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.CANCELED,
      },
    });

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Gagal membuat Stripe checkout session.");
  }

  if (!session.url) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.CANCELED,
      },
    });

    throw new Error("Stripe checkout URL tidak tersedia.");
  }

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    paymentId: payment.id,
  };
}
