import type Stripe from "stripe";
import { PaymentStatus, StatusSubscription } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { switchUserSubscriptionPlanById } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FAR_FUTURE_DATE = new Date("9999-12-31T23:59:59.000Z");

type BillingMetadata = {
  userId: bigint | null;
  planId: bigint | null;
  subscriptionId: bigint | null;
  paymentId: bigint | null;
};

function emptyBillingMetadata(): BillingMetadata {
  return {
    userId: null,
    planId: null,
    subscriptionId: null,
    paymentId: null,
  };
}

function parseBigIntValue(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

function extractBillingMetadata(metadata: unknown): BillingMetadata {
  if (!metadata || typeof metadata !== "object") {
    return emptyBillingMetadata();
  }

  const record = metadata as Record<string, unknown>;

  return {
    userId: parseBigIntValue(record.userId),
    planId: parseBigIntValue(record.planId),
    subscriptionId: parseBigIntValue(record.subscriptionId),
    paymentId: parseBigIntValue(record.paymentId),
  };
}

function mergeBillingMetadata(primary: BillingMetadata, fallback: BillingMetadata): BillingMetadata {
  return {
    userId: primary.userId ?? fallback.userId,
    planId: primary.planId ?? fallback.planId,
    subscriptionId: primary.subscriptionId ?? fallback.subscriptionId,
    paymentId: primary.paymentId ?? fallback.paymentId,
  };
}

function readStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === "object") {
    const maybeId = (value as { id?: unknown }).id;

    if (typeof maybeId === "string" && maybeId.trim().length > 0) {
      return maybeId;
    }
  }

  return null;
}

function readLegacyField(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") {
    return null;
  }

  return (source as Record<string, unknown>)[key] ?? null;
}

function normalizeCurrency(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : "usd";
}

function timestampToDate(timestamp: number | null | undefined, fallback: Date): Date {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date(fallback);
  }

  return new Date(timestamp * 1000);
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status | null | undefined,
): StatusSubscription {
  switch (status) {
    case "trialing":
      return StatusSubscription.trialing;
    case "active":
      return StatusSubscription.active;
    case "canceled":
      return StatusSubscription.canceled;
    case "incomplete_expired":
      return StatusSubscription.expired;
    case "past_due":
    case "incomplete":
    case "paused":
    case "unpaid":
      return StatusSubscription.past_due;
    default:
      return StatusSubscription.active;
  }
}

function getStripeSubscriptionPeriodStart(subscription: Stripe.Subscription): number | null {
  const legacyPeriodStart = readLegacyField(subscription, "current_period_start");

  if (typeof legacyPeriodStart === "number" && Number.isFinite(legacyPeriodStart)) {
    return legacyPeriodStart;
  }

  const firstItem = subscription.items?.data?.[0] as
    | { current_period_start?: unknown }
    | undefined;
  const itemPeriodStart = firstItem?.current_period_start;

  if (typeof itemPeriodStart === "number" && Number.isFinite(itemPeriodStart)) {
    return itemPeriodStart;
  }

  return null;
}

function getStripeSubscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const legacyPeriodEnd = readLegacyField(subscription, "current_period_end");

  if (typeof legacyPeriodEnd === "number" && Number.isFinite(legacyPeriodEnd)) {
    return legacyPeriodEnd;
  }

  const firstItem = subscription.items?.data?.[0] as
    | { current_period_end?: unknown }
    | undefined;
  const itemPeriodEnd = firstItem?.current_period_end;

  if (typeof itemPeriodEnd === "number" && Number.isFinite(itemPeriodEnd)) {
    return itemPeriodEnd;
  }

  return null;
}

function getStripeSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const parentSubscriptionId = readStringId(parentSubscription);

  if (parentSubscriptionId) {
    return parentSubscriptionId;
  }

  return readStringId(readLegacyField(invoice, "subscription"));
}

function getStripePaymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  return readStringId(readLegacyField(invoice, "payment_intent"));
}

function getStripeChargeIdFromInvoice(invoice: Stripe.Invoice): string | null {
  return readStringId(readLegacyField(invoice, "charge"));
}

async function resolveStripeSubscriptionContext(stripeSubscriptionId: string): Promise<{
  metadata: BillingMetadata;
  subscription: Stripe.Subscription | null;
}> {
  const stripe = getStripeClient();

  try {
    const rawSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    if ("deleted" in rawSubscription && rawSubscription.deleted) {
      return {
        metadata: emptyBillingMetadata(),
        subscription: null,
      };
    }

    const subscription = rawSubscription as Stripe.Subscription;

    return {
      metadata: extractBillingMetadata(subscription.metadata),
      subscription,
    };
  } catch {
    return {
      metadata: emptyBillingMetadata(),
      subscription: null,
    };
  }
}

async function markEventProcessingStarted(event: Stripe.Event): Promise<boolean> {
  try {
    await prisma.webhookLog.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        payload: event as unknown as object,
        processed: false,
      },
    });

    return true;
  } catch (error) {
    const maybeCode = (error as { code?: string } | null)?.code;
    if (maybeCode === "P2002") {
      return false;
    }

    throw error;
  }
}

async function markEventProcessingFinished(eventId: string) {
  await prisma.webhookLog.update({
    where: {
      stripeEventId: eventId,
    },
    data: {
      processed: true,
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}

async function markEventProcessingFailed(eventId: string, message: string) {
  await prisma.webhookLog.update({
    where: {
      stripeEventId: eventId,
    },
    data: {
      processed: false,
      errorMessage: message.slice(0, 1000),
    },
  });
}

async function syncLocalSubscriptionFromStripe(params: {
  metadata: BillingMetadata;
  stripeSubscription: Stripe.Subscription | null;
  eventType: string;
  description: string;
}) {
  const { metadata, stripeSubscription, eventType, description } = params;

  const userId = metadata.userId;
  const planId = metadata.planId;

  if (!userId || !planId) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const subscriptionDb = tx as unknown as Pick<typeof prisma, "plan" | "subscription">;

    const currentSubscription = await switchUserSubscriptionPlanById({
      userId,
      planId,
      db: subscriptionDb,
    });

    const nextStatus = stripeSubscription
      ? mapStripeSubscriptionStatus(stripeSubscription.status)
      : currentSubscription.status;
    const stripePeriodStart = stripeSubscription
      ? getStripeSubscriptionPeriodStart(stripeSubscription)
      : null;
    const stripePeriodEnd = stripeSubscription
      ? getStripeSubscriptionPeriodEnd(stripeSubscription)
      : null;

    const updatedSubscription = await tx.subscription.update({
      where: {
        id: currentSubscription.id,
      },
      data: {
        status: nextStatus,
        startedAt: stripeSubscription
          ? timestampToDate(stripeSubscription.start_date, currentSubscription.startedAt)
          : currentSubscription.startedAt,
        trialEndsAt: stripeSubscription
          ? timestampToDate(stripeSubscription.trial_end, FAR_FUTURE_DATE)
          : currentSubscription.trialEndsAt,
        currentPeriodStart: stripePeriodStart
          ? timestampToDate(stripePeriodStart, currentSubscription.currentPeriodStart)
          : currentSubscription.currentPeriodStart,
        currentPeriodEnd: stripePeriodEnd
          ? timestampToDate(stripePeriodEnd, currentSubscription.currentPeriodEnd)
          : currentSubscription.currentPeriodEnd,
        cancelAt: stripeSubscription
          ? timestampToDate(stripeSubscription.cancel_at, FAR_FUTURE_DATE)
          : currentSubscription.cancelAt,
        canceledAt: stripeSubscription
          ? timestampToDate(stripeSubscription.canceled_at, FAR_FUTURE_DATE)
          : currentSubscription.canceledAt,
        endedAt: stripeSubscription
          ? timestampToDate(stripeSubscription.ended_at, FAR_FUTURE_DATE)
          : currentSubscription.endedAt,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: updatedSubscription.id,
        eventType,
        oldValue: {},
        newValue: {
          stripeStatus: stripeSubscription?.status ?? null,
          mappedStatus: nextStatus,
          planId: planId.toString(),
          stripeSubscriptionId: stripeSubscription?.id ?? null,
        },
        description,
      },
    });

    return updatedSubscription;
  });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  let metadata = extractBillingMetadata(session.metadata);

  const stripeSubscriptionId = readStringId(session.subscription);

  if (stripeSubscriptionId) {
    const subscriptionContext = await resolveStripeSubscriptionContext(stripeSubscriptionId);
    metadata = mergeBillingMetadata(metadata, subscriptionContext.metadata);

    await syncLocalSubscriptionFromStripe({
      metadata,
      stripeSubscription: subscriptionContext.subscription,
      eventType: "stripe.checkout.session.completed",
      description: `Checkout selesai untuk session ${session.id}.`,
    });
  } else if (metadata.userId && metadata.planId) {
    await syncLocalSubscriptionFromStripe({
      metadata,
      stripeSubscription: null,
      eventType: "stripe.checkout.session.completed",
      description: `Checkout selesai untuk session ${session.id}.`,
    });
  }

  if (!metadata.paymentId) {
    return;
  }

  const paidNow =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";

  await prisma.payment.updateMany({
    where: {
      id: metadata.paymentId,
    },
    data: {
      status: paidNow ? PaymentStatus.PAID : PaymentStatus.PENDING,
      paidAt: paidNow ? new Date() : null,
      failedAt: null,
      stripeInvoiceId: readStringId(session.invoice),
      stripePaymentIntentId: readStringId(session.payment_intent),
    },
  });
}

async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const metadata = extractBillingMetadata(session.metadata);

  if (!metadata.paymentId) {
    return;
  }

  await prisma.payment.updateMany({
    where: {
      id: metadata.paymentId,
    },
    data: {
      status: PaymentStatus.CANCELED,
      stripeInvoiceId: readStringId(session.invoice),
      stripePaymentIntentId: readStringId(session.payment_intent),
    },
  });
}

async function handleCustomerSubscriptionEvent(
  stripeSubscription: Stripe.Subscription,
  eventType: string,
) {
  const metadata = extractBillingMetadata(stripeSubscription.metadata);

  await syncLocalSubscriptionFromStripe({
    metadata,
    stripeSubscription,
    eventType,
    description: `Sinkronisasi subscription dari event ${eventType}.`,
  });
}

async function upsertPaymentByInvoice(params: {
  invoice: Stripe.Invoice;
  status: PaymentStatus;
}) {
  const { invoice, status } = params;

  let metadata = extractBillingMetadata(invoice.metadata);
  const stripeSubscriptionId = getStripeSubscriptionIdFromInvoice(invoice);
  let stripeSubscription: Stripe.Subscription | null = null;

  if (stripeSubscriptionId) {
    const subscriptionContext = await resolveStripeSubscriptionContext(stripeSubscriptionId);
    metadata = mergeBillingMetadata(metadata, subscriptionContext.metadata);
    stripeSubscription = subscriptionContext.subscription;
  }

  if (metadata.userId && metadata.planId) {
    await syncLocalSubscriptionFromStripe({
      metadata,
      stripeSubscription,
      eventType: `stripe.${status === PaymentStatus.PAID ? "invoice.paid" : "invoice.payment_failed"}`,
      description: `Sinkronisasi subscription dari invoice ${invoice.id}.`,
    });
  }

  if (!metadata.userId) {
    return;
  }

  const now = new Date();
  const amount =
    status === PaymentStatus.PAID
      ? Math.max(invoice.amount_paid || invoice.amount_due || 0, 0)
      : Math.max(invoice.amount_due || invoice.amount_remaining || 0, 0);
  const stripePaymentIntentId = getStripePaymentIntentIdFromInvoice(invoice);
  const stripeChargeId = getStripeChargeIdFromInvoice(invoice);

  await prisma.payment.upsert({
    where: {
      stripeInvoiceId: invoice.id,
    },
    create: {
      userId: metadata.userId,
      subscriptionId: metadata.subscriptionId,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId,
      stripeChargeId,
      amount,
      currency: normalizeCurrency(invoice.currency),
      status,
      paidAt: status === PaymentStatus.PAID ? now : null,
      failedAt: status === PaymentStatus.FAILED ? now : null,
    },
    update: {
      userId: metadata.userId,
      subscriptionId: metadata.subscriptionId,
      amount,
      currency: normalizeCurrency(invoice.currency),
      status,
      paidAt: status === PaymentStatus.PAID ? now : null,
      failedAt: status === PaymentStatus.FAILED ? now : null,
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
      ...(stripeChargeId ? { stripeChargeId } : {}),
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  await upsertPaymentByInvoice({
    invoice,
    status: PaymentStatus.PAID,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  await upsertPaymentByInvoice({
    invoice,
    status: PaymentStatus.FAILED,
  });
}

export async function POST(request: Request) {
  const stripeSignature = request.headers.get("stripe-signature");

  if (!stripeSignature) {
    return new Response("Missing stripe signature.", { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, stripeSignature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid stripe webhook signature.";
    return new Response(message, { status: 400 });
  }

  const shouldProcess = await markEventProcessingStarted(event);

  if (!shouldProcess) {
    return new Response("Event already processed.", { status: 200 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "checkout.session.expired") {
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "customer.subscription.created") {
      await handleCustomerSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        "stripe.customer.subscription.created",
      );
    }

    if (event.type === "customer.subscription.updated") {
      await handleCustomerSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        "stripe.customer.subscription.updated",
      );
    }

    if (event.type === "customer.subscription.deleted") {
      await handleCustomerSubscriptionEvent(
        event.data.object as Stripe.Subscription,
        "stripe.customer.subscription.deleted",
      );
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    }

    if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
    }

    await markEventProcessingFinished(event.id);
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await markEventProcessingFailed(event.id, message);
    return new Response(message, { status: 500 });
  }
}
