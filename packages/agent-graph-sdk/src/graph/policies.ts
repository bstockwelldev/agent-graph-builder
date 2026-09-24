import type { PolicyEnforcement, PolicyException, PolicyParamValue, PolicyRuleInfo, PolicySettings } from "../types.js";

/**
 * Pure helpers for configurable policies (STO-608, backend/app/policies.py),
 * shared by the workspace /policies page and the graph's Policies panel.
 */

export const ENFORCEMENT_OPTIONS: { value: PolicyEnforcement; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "The rule never runs." },
  { value: "warn", label: "Warn", description: "A warning; never blocks." },
  { value: "block_publish", label: "Block publish", description: "A warning on the draft; blocks publishing a release." },
  { value: "block", label: "Block", description: "Blocks runs and publishing." },
];

export function enforcementLabel(enforcement: PolicyEnforcement): string {
  return ENFORCEMENT_OPTIONS.find((option) => option.value === enforcement)?.label ?? enforcement;
}

export const CATEGORY_LABEL: Record<PolicyRuleInfo["category"], string> = {
  security: "Security",
  reliability: "Reliability",
  cost: "Cost",
  governance: "Governance",
};

export const SOURCE_LABEL = { default: "Default", workspace: "Workspace", graph: "This graph" } as const;

type Rules = PolicySettings["rules"];

/** Sets (or, with `null`, clears) one rule's enforcement, dropping empty entries. */
export function setRuleEnforcement(rules: Rules, code: string, enforcement: PolicyEnforcement | null): Rules {
  const current = rules[code] ?? { params: {} };
  return prune({ ...rules, [code]: { ...current, enforcement } });
}

/** Sets (or, with `undefined`, clears) one rule parameter, dropping empty entries. */
export function setRuleParam(rules: Rules, code: string, name: string, value: PolicyParamValue | undefined): Rules {
  const current = rules[code] ?? { params: {} };
  const params = { ...current.params };
  if (value === undefined) delete params[name];
  else params[name] = value;
  return prune({ ...rules, [code]: { ...current, params } });
}

function prune(rules: Rules): Rules {
  return Object.fromEntries(
    Object.entries(rules).filter(([, setting]) => setting.enforcement != null || Object.keys(setting.params ?? {}).length > 0),
  );
}

// ------------------------------------------------------------- exceptions

export const WAIVE_DURATIONS_DAYS = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** An active exception expiring within this many days is flagged. */
export const EXPIRING_SOON_DAYS = 7;

export type ExceptionState = "active" | "expiring" | "expired";

export function exceptionStatus(exception: Pick<PolicyException, "expires_at">, now = Date.now()): { state: ExceptionState; msLeft: number } {
  const msLeft = new Date(exception.expires_at).getTime() - now;
  if (!Number.isFinite(msLeft) || msLeft <= 0) return { state: "expired", msLeft: Math.min(0, msLeft || 0) };
  return { state: msLeft <= EXPIRING_SOON_DAYS * DAY_MS ? "expiring" : "active", msLeft };
}

/** "in 3 days", "in 5 hours", "2 days ago". */
export function formatExpiry(exception: Pick<PolicyException, "expires_at">, now = Date.now()): string {
  const ms = new Date(exception.expires_at).getTime() - now;
  if (!Number.isFinite(ms)) return exception.expires_at;
  const abs = Math.abs(ms);
  const [amount, unit] = abs >= DAY_MS ? [Math.round(abs / DAY_MS), "day"] : [Math.max(1, Math.round(abs / 3_600_000)), "hour"];
  const phrase = `${amount} ${unit}${amount === 1 ? "" : "s"}`;
  return ms > 0 ? `in ${phrase}` : `${phrase} ago`;
}

export function expiryFromNow(days: number, now = Date.now()): string {
  return new Date(now + days * DAY_MS).toISOString();
}

/** Extends from the later of now and the current expiry, so extending an expired waiver starts today. */
export function extendExpiry(exception: Pick<PolicyException, "expires_at">, days: number, now = Date.now()): string {
  const current = new Date(exception.expires_at).getTime();
  return new Date(Math.max(now, Number.isFinite(current) ? current : now) + days * DAY_MS).toISOString();
}

/** Sorts expired last, then soonest-expiring first. */
export function sortExceptions<T extends Pick<PolicyException, "expires_at">>(exceptions: readonly T[], now = Date.now()): T[] {
  const rank = { expiring: 0, active: 1, expired: 2 } as const;
  return [...exceptions].sort((a, b) => {
    const sa = exceptionStatus(a, now);
    const sb = exceptionStatus(b, now);
    return rank[sa.state] - rank[sb.state] || a.expires_at.localeCompare(b.expires_at);
  });
}
