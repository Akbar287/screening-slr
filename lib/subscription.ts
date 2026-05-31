import { StatusSubscription, type Plan, type Subscription } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type SubscriptionDbClient = Pick<typeof prisma, "plan" | "subscription">;

export type SubscriptionWithPlan = Subscription & {
  Plan: Plan;
};

export const DEFAULT_PLAN_NAME = "Free";

const FAR_FUTURE_DATE = new Date("9999-12-31T23:59:59.000Z");

function normalizePlanName(value: string): string {
  return value.trim().toLowerCase();
}

function addDays(source: Date, days: number): Date {
  const result = new Date(source);
  result.setUTCDate(result.getUTCDate() + Math.max(0, days));
  return result;
}

function addBillingInterval(source: Date, billingInterval: string): Date {
  const interval = billingInterval.trim().toLowerCase();
  const result = new Date(source);

  if (interval === "yearly" || interval === "annual") {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    return result;
  }

  if (interval === "weekly") {
    result.setUTCDate(result.getUTCDate() + 7);
    return result;
  }

  result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
}

function toPlanMap(plans: Plan[]): Map<string, Plan> {
  const map = new Map<string, Plan>();

  for (const plan of plans) {
    const key = normalizePlanName(plan.name);
    const existingPlan = map.get(key);

    if (!existingPlan) {
      map.set(key, plan);
      continue;
    }

    // Jika ada nama plan yang sama, prioritaskan plan aktif.
    if (!existingPlan.isActive && plan.isActive) {
      map.set(key, plan);
    }
  }

  return map;
}

export async function ensureDefaultPlans(db: SubscriptionDbClient = prisma): Promise<Plan[]> {
  const plans = await db.plan.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return Array.from(toPlanMap(plans).values());
}

function buildSubscriptionDateFields(plan: Plan, now = new Date()) {
  const trialEndsAt = addDays(now, plan.trialDays);
  const currentPeriodEnd = addBillingInterval(now, plan.billingInterval);
  const farFutureDate = new Date(FAR_FUTURE_DATE);

  return {
    startedAt: now,
    trialEndsAt,
    currentPeriodStart: now,
    currentPeriodEnd,
    cancelAt: farFutureDate,
    canceledAt: farFutureDate,
    endedAt: farFutureDate,
  };
}

function findPlanByName(plans: Plan[], planName: string): Plan | null {
  const normalizedPlanName = normalizePlanName(planName);
  return plans.find((plan) => normalizePlanName(plan.name) === normalizedPlanName) ?? null;
}

async function findPlanById(
  db: SubscriptionDbClient,
  planId: bigint,
): Promise<Plan | null> {
  return db.plan.findUnique({
    where: {
      id: planId,
    },
  });
}

export async function ensureUserSubscription({
  userId,
  plans,
  db = prisma,
}: {
  userId: bigint;
  plans?: Plan[];
  db?: SubscriptionDbClient;
}): Promise<SubscriptionWithPlan> {
  const existingSubscription = await db.subscription.findFirst({
    where: {
      userId,
    },
    include: {
      Plan: true,
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });

  if (existingSubscription) {
    return existingSubscription;
  }

  const resolvedPlans = plans ?? (await ensureDefaultPlans(db));

  const freePlan = resolvedPlans.find(
    (plan) => normalizePlanName(plan.name) === normalizePlanName(DEFAULT_PLAN_NAME),
  );

  if (!freePlan) {
    throw new Error("Plan Free tidak ditemukan.");
  }

  return db.subscription.create({
    data: {
      userId,
      planId: freePlan.id,
      status: StatusSubscription.active,
      ...buildSubscriptionDateFields(freePlan),
    },
    include: {
      Plan: true,
    },
  });
}

export async function switchUserSubscriptionPlan({
  userId,
  planName,
  db = prisma,
}: {
  userId: bigint;
  planName: string;
  db?: SubscriptionDbClient;
}): Promise<SubscriptionWithPlan> {
  const plans = await ensureDefaultPlans(db);
  const selectedPlan = findPlanByName(plans, planName);

  if (!selectedPlan || !selectedPlan.isActive) {
    throw new Error("Plan yang dipilih tidak tersedia.");
  }

  const currentSubscription = await ensureUserSubscription({
    userId,
    plans,
    db,
  });

  if (currentSubscription.planId === selectedPlan.id) {
    return currentSubscription;
  }

  return db.subscription.update({
    where: {
      id: currentSubscription.id,
    },
    data: {
      planId: selectedPlan.id,
      status: StatusSubscription.active,
      ...buildSubscriptionDateFields(selectedPlan),
    },
    include: {
      Plan: true,
    },
  });
}

export async function switchUserSubscriptionPlanById({
  userId,
  planId,
  db = prisma,
}: {
  userId: bigint;
  planId: bigint;
  db?: SubscriptionDbClient;
}): Promise<SubscriptionWithPlan> {
  const selectedPlan = await findPlanById(db, planId);

  if (!selectedPlan || !selectedPlan.isActive) {
    throw new Error("Plan yang dipilih tidak tersedia.");
  }

  const currentSubscription = await ensureUserSubscription({
    userId,
    db,
  });

  if (currentSubscription.planId === selectedPlan.id) {
    return currentSubscription;
  }

  return db.subscription.update({
    where: {
      id: currentSubscription.id,
    },
    data: {
      planId: selectedPlan.id,
      status: StatusSubscription.active,
      ...buildSubscriptionDateFields(selectedPlan),
    },
    include: {
      Plan: true,
    },
  });
}
