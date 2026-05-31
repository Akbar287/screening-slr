import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createStripeCheckoutForPlan } from "@/lib/stripe-billing";
import {
  ensureDefaultPlans,
  ensureUserSubscription,
  switchUserSubscriptionPlan,
} from "@/lib/subscription";

type SelectSubscriptionPayload = {
  planName?: string;
};

function normalizePlanName(value: string): string {
  return value.trim().toLowerCase();
}

function toNumericPrice(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Anda harus login terlebih dahulu." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as SelectSubscriptionPayload;
  const planName = body.planName?.trim() ?? "";

  if (planName.length === 0) {
    return NextResponse.json(
      { message: "Plan belum dipilih." },
      { status: 400 },
    );
  }

  let userId: bigint;

  try {
    userId = BigInt(session.user.id);
  } catch {
    return NextResponse.json(
      { message: "Identitas user tidak valid." },
      { status: 400 },
    );
  }

  try {
    const plans = await ensureDefaultPlans();
    const selectedPlan = plans.find(
      (plan) => normalizePlanName(plan.name) === normalizePlanName(planName),
    );

    if (!selectedPlan || !selectedPlan.isActive) {
      return NextResponse.json(
        { message: "Plan yang dipilih tidak tersedia." },
        { status: 400 },
      );
    }

    const activeSubscription = await ensureUserSubscription({
      userId,
    });
    const currentPlanName = activeSubscription.Plan.name;

    if (activeSubscription.planId === selectedPlan.id) {
      return NextResponse.json(
        {
          mode: "direct",
          message: `Anda sudah berada di plan ${currentPlanName}.`,
          plan: {
            id: activeSubscription.Plan.id.toString(),
            name: activeSubscription.Plan.name,
          },
        },
        { status: 200 },
      );
    }

    const selectedPlanPrice = toNumericPrice(selectedPlan.price.toString());
    const isPaidPlan = Number.isFinite(selectedPlanPrice) && selectedPlanPrice > 0;

    if (isPaidPlan) {
      const checkoutSession = await createStripeCheckoutForPlan({
        userId,
        subscriptionId: activeSubscription.id,
        plan: selectedPlan,
        requestOrigin: request.headers.get("origin"),
      });

      return NextResponse.json(
        {
          mode: "checkout",
          message: "Lanjutkan pembayaran melalui Stripe Checkout.",
          checkoutUrl: checkoutSession.checkoutUrl,
          sessionId: checkoutSession.sessionId,
        },
        { status: 200 },
      );
    }

    const subscription = await switchUserSubscriptionPlan({
      userId,
      planName,
    });

    return NextResponse.json(
      {
        mode: "direct",
        message: `Berhasil berlangganan plan ${subscription.Plan.name}.`,
        plan: {
          id: subscription.Plan.id.toString(),
          name: subscription.Plan.name,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memperbarui subscription plan.";

    return NextResponse.json(
      { message },
      { status: 400 },
    );
  }
}
