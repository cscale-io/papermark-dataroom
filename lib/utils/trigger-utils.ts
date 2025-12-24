import { BasePlan } from "../swr/use-billing";

// Trigger.dev SDK v3 expects queue to be just the name string
// Queue concurrency is configured in the task definition or Trigger.dev dashboard
export const conversionQueue = (plan: string): string => {
  const planName = plan.split("+")[0] as BasePlan;
  return `conversion-${planName}`;
};
