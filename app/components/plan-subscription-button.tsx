"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Crown, Loader2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type PlanFeatureSummary = {
  key: string;
  name: string;
  limitValue: number;
  limitUnit: string;
};

type PlanSummary = {
  name: string;
  description: string;
  price: string;
  currency: string;
  billingInterval: string;
  trialDays: number;
  isActive: boolean;
  features: PlanFeatureSummary[];
};

type SubscriptionSelectResponse = {
  mode?: "direct" | "checkout";
  message?: string;
  checkoutUrl?: string;
  plan?: {
    name?: string;
  };
};

type PlanSubscriptionButtonProps = {
  currentPlanName: string;
  plans: PlanSummary[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function formatPlanPrice(price: string, currency: string): string {
  const numericValue = Number.parseFloat(price);

  if (!Number.isFinite(numericValue)) {
    return `${price} ${currency}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
  }
}

function formatFeatureLimit(limitValue: number, limitUnit: string): string {
  const unit = limitUnit.trim();

  if (!Number.isFinite(limitValue) || limitValue < 0) {
    return unit.length > 0 ? unit : "Included";
  }

  if (limitValue === 0) {
    return "Included";
  }

  return unit.length > 0 ? `${limitValue} ${unit}` : String(limitValue);
}

export function PlanSubscriptionButton({
  currentPlanName,
  plans,
}: PlanSubscriptionButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activePlanName, setActivePlanName] = useState(currentPlanName);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const orderedPlans = useMemo(() => plans, [plans]);
  const hasPlanOptions = orderedPlans.length > 0;

  function closeDialog() {
    if (submittingPlan) {
      return;
    }

    setIsOpen(false);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubscribe(planName: string) {
    setSubmittingPlan(planName);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/subscription/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planName }),
      });

      const payload = (await response.json()) as SubscriptionSelectResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Gagal memperbarui plan.");
      }

      if (payload.mode === "checkout") {
        const checkoutUrl = payload.checkoutUrl?.trim();

        if (!checkoutUrl) {
          throw new Error("Stripe checkout URL tidak tersedia.");
        }

        window.location.href = checkoutUrl;
        return;
      }

      const resolvedPlanName = payload.plan?.name?.trim() || planName;
      setActivePlanName(resolvedPlanName);
      setSuccessMessage(payload.message || "Plan berhasil diperbarui.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui plan.";
      setErrorMessage(message);
    } finally {
      setSubmittingPlan(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2 rounded-xl border-indigo-300/60 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
      >
        <Crown className="h-4 w-4" />
        Plan: {activePlanName}
      </Button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="plan-subscription-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeDialog}
              aria-hidden="true"
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 w-full max-w-4xl rounded-2xl border border-border bg-card px-5 py-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="inline-flex items-center gap-1 rounded-full border border-indigo-300/70 bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Subscription Plan
                  </p>
                  <h3 className="text-2xl font-black leading-tight">
                    Pilih Plan Terbaik untuk Workflow SLR Anda
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Plan aktif saat ini:{" "}
                    <span className="font-semibold text-foreground">{activePlanName}</span>
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeDialog}
                  disabled={Boolean(submittingPlan)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {errorMessage ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="mt-4 rounded-md border border-emerald-400/50 bg-emerald-100/70 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {successMessage}
                </p>
              ) : null}

              {hasPlanOptions && orderedPlans.length > 3 ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Geser horizontal untuk melihat semua plan.
                </p>
              ) : null}

              <div className="mt-5 overflow-x-auto pb-2">
                {hasPlanOptions ? (
                  <div className="flex min-w-max snap-x snap-mandatory gap-4">
                    {orderedPlans.map((plan) => {
                      const isCurrentPlan = normalize(plan.name) === normalize(activePlanName);
                      const isSubmittingThisPlan = submittingPlan === plan.name;
                      const isDisabledByStatus = !plan.isActive;

                      return (
                        <motion.div
                          key={plan.name}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className={`w-[290px] shrink-0 snap-start rounded-2xl border p-4 shadow-sm sm:w-[320px] md:w-[340px] ${
                            isCurrentPlan
                              ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                              : "border-border bg-background/85"
                          }`}
                        >
                          <div className="space-y-2">
                            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                              {plan.name}
                            </p>
                            <p className="text-3xl font-black">{formatPlanPrice(plan.price, plan.currency)}</p>
                            <p className="text-xs font-medium uppercase text-muted-foreground">
                              /{plan.billingInterval}
                            </p>
                          </div>

                          <p className="mt-3 min-h-16 text-sm text-muted-foreground">{plan.description}</p>

                          <div className="mt-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            Trial {plan.trialDays} hari
                          </div>

                          {isDisabledByStatus ? (
                            <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-100/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                              Plan tidak aktif
                            </div>
                          ) : null}

                          <div className="mt-3 space-y-2">
                            {plan.features.length > 0 ? (
                              plan.features.slice(0, 4).map((feature) => (
                                <div
                                  key={`${plan.name}-${feature.key}`}
                                  className="flex items-start gap-2 rounded-lg bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground"
                                >
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                  <span>
                                    <span className="font-medium text-foreground">{feature.name}</span>{" "}
                                    • {formatFeatureLimit(feature.limitValue, feature.limitUnit)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="rounded-lg bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                                Fitur plan belum tersedia.
                              </p>
                            )}
                          </div>

                          <Button
                            type="button"
                            className="mt-4 w-full"
                            variant={isCurrentPlan ? "secondary" : "default"}
                            disabled={isCurrentPlan || Boolean(submittingPlan) || isDisabledByStatus}
                            onClick={() => handleSubscribe(plan.name)}
                          >
                            {isCurrentPlan ? (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                Anda sudah di Plan ini
                              </>
                            ) : isDisabledByStatus ? (
                              "Plan Tidak Aktif"
                            ) : isSubmittingThisPlan ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Memproses...
                              </>
                            ) : (
                              "Subscription"
                            )}
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-100/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    Data plan belum tersedia. Hubungi admin untuk menambahkan plan subscription.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
