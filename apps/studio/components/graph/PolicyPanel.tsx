import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EffectivePolicyRule, PolicyEnforcement, PolicyException, PolicySettings } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { errorDetail } from "@/lib/knowledgePanel";
import {
  CATEGORY_LABEL,
  ENFORCEMENT_OPTIONS,
  enforcementLabel,
  exceptionStatus,
  extendExpiry,
  formatExpiry,
  setRuleEnforcement,
  setRuleParam,
  sortExceptions,
  SOURCE_LABEL,
  type ExceptionState,
} from "@bstockwelldev/agent-graph-sdk/graph";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Combobox } from "./ui/Combobox";
import { NumberStepper } from "./ui/NumberStepper";
import { SkeletonBlock } from "./ui/Skeleton";

// Graph Policies panel (STO-608). Graph-scoped like Releases/Knowledge: this
// graph's overrides on top of the workspace defaults (edited on /policies),
// plus its time-boxed exceptions. Every change saves immediately and asks
// the editor to re-validate, so the canvas diagnostics follow along.

const INHERIT = "inherit";

export function PolicyPanel({
  graphId,
  layout = "rail",
  reducedMotion = false,
  onPoliciesChanged,
}: {
  graphId: string | null;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
  /** Called after an override or exception changes, to refresh diagnostics. */
  onPoliciesChanged?: () => void;
}) {
  const [effective, setEffective] = useState<EffectivePolicyRule[]>([]);
  const [inherited, setInherited] = useState<Record<string, EffectivePolicyRule>>({});
  const [overrides, setOverrides] = useState<PolicySettings["rules"]>({});
  const [exceptions, setExceptions] = useState<PolicyException[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyExceptionId, setBusyExceptionId] = useState<string | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const [graphEffective, workspaceEffective, graphSettings, graphExceptions] = await Promise.all([
      client.policies.effective({ graphId: id }),
      client.policies.effective(),
      client.policies.graph.get(id),
      client.policies.exceptions.list({ graphId: id }),
    ]);
    setEffective(graphEffective);
    setInherited(Object.fromEntries(workspaceEffective.map((rule) => [rule.rule.code, rule])));
    setOverrides(graphSettings.rules);
    setExceptions(graphExceptions);
  }, []);

  useEffect(() => {
    if (!graphId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(graphId)
      .catch((err: unknown) => {
        if (!cancelled) setError(errorDetail(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, load]);

  const saveOverrides = useCallback(
    async (next: PolicySettings["rules"]) => {
      if (!graphId) return;
      setSaving(true);
      setError(null);
      const previous = overrides;
      setOverrides(next);
      try {
        await client.policies.graph.save(graphId, { rules: next });
        setEffective(await client.policies.effective({ graphId }));
        onPoliciesChanged?.();
      } catch (err) {
        setOverrides(previous);
        setError(errorDetail(err));
      } finally {
        setSaving(false);
      }
    },
    [graphId, onPoliciesChanged, overrides],
  );

  const exceptionAction = useCallback(
    async (exceptionId: string, action: () => Promise<unknown>) => {
      if (!graphId) return;
      setBusyExceptionId(exceptionId);
      setError(null);
      try {
        await action();
        setExceptions(await client.policies.exceptions.list({ graphId }));
        setPendingRevokeId(null);
        onPoliciesChanged?.();
      } catch (err) {
        setError(errorDetail(err));
      } finally {
        setBusyExceptionId(null);
      }
    },
    [graphId, onPoliciesChanged],
  );

  const titles = Object.fromEntries(effective.map((rule) => [rule.rule.code, rule.rule.title]));
  const now = Date.now();

  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        {error && (
          <div role="alert" style={{ ...typeScale.caption, color: color.warning[500], marginBottom: spacing[2], lineHeight: "16px" }}>
            {error}
          </div>
        )}
        <CollapsibleSection sectionId="policy-rules" title="Rules" defaultOpen reducedMotion={reducedMotion}>
          <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", marginBottom: spacing[2] }}>
            Overrides for this graph. Anything left on Inherit follows the{" "}
            <Link href="/policies" style={{ color: color.primary[500] }}>
              workspace policies
            </Link>
            .
          </div>
          {loading ? (
            <SkeletonBlock lines={4} gap={spacing[2]} />
          ) : (
            effective.map((rule) => {
              const code = rule.rule.code;
              const override = overrides[code];
              const parent = inherited[code];
              return (
                <div key={code} style={rowStyle} data-testid={`policy-rule-${code}`}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: spacing[2] }}>
                    <span style={{ ...typeScale.caption, fontWeight: 600 }}>{rule.rule.title}</span>
                    <span style={chipStyle}>{CATEGORY_LABEL[rule.rule.category]}</span>
                    {rule.rule.gate === "publish" && <span style={chipStyle}>Publish only</span>}
                  </div>
                  <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", marginTop: spacing[1] }}>{rule.rule.description}</div>
                  <div style={{ marginTop: spacing[2] }}>
                    <Combobox
                      aria-label={`${rule.rule.title} enforcement`}
                      value={override?.enforcement ?? INHERIT}
                      disabled={saving}
                      onChange={(value) =>
                        void saveOverrides(setRuleEnforcement(overrides, code, value === INHERIT ? null : (value as PolicyEnforcement)))
                      }
                      options={[
                        {
                          value: INHERIT,
                          label: `Inherit (${enforcementLabel(parent?.enforcement ?? rule.rule.default_enforcement)})`,
                          description: parent ? `From ${SOURCE_LABEL[parent.enforcement_source].toLowerCase()}` : undefined,
                        },
                        ...ENFORCEMENT_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.description })),
                      ]}
                    />
                  </div>
                  {rule.rule.params.map((spec) => {
                    const overridden = override?.params?.[spec.name] !== undefined;
                    const value = rule.params[spec.name] ?? spec.default;
                    return (
                      <div key={spec.name} style={{ marginTop: spacing[2] }}>
                        <div style={{ display: "flex", alignItems: "center", gap: spacing[2], marginBottom: spacing[1] }}>
                          <span style={{ ...typeScale.caption, opacity: 0.8 }}>{spec.label}</span>
                          <span style={{ ...typeScale.caption, opacity: 0.55 }}>· {SOURCE_LABEL[rule.param_sources[spec.name] ?? "default"]}</span>
                          {overridden && (
                            <button
                              type="button"
                              style={linkButtonStyle}
                              disabled={saving}
                              onClick={() => void saveOverrides(setRuleParam(overrides, code, spec.name, undefined))}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        {spec.type === "integer" ? (
                          <NumberStepper
                            aria-label={spec.label}
                            value={Number(value)}
                            min={spec.minimum ?? 0}
                            onChange={(next) => void saveOverrides(setRuleParam(overrides, code, spec.name, next))}
                          />
                        ) : (
                          <Combobox
                            aria-label={spec.label}
                            value={String(value)}
                            disabled={saving}
                            onChange={(next) => void saveOverrides(setRuleParam(overrides, code, spec.name, next))}
                            options={(spec.choices ?? []).map((choice) => ({ value: choice, label: choice }))}
                          />
                        )}
                      </div>
                    );
                  })}
                  <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[2] }}>
                    Effective: {enforcementLabel(rule.enforcement)} · {SOURCE_LABEL[rule.enforcement_source]}
                  </div>
                </div>
              );
            })
          )}
        </CollapsibleSection>

        <CollapsibleSection sectionId="policy-exceptions" title={`Exceptions (${exceptions.length})`} defaultOpen reducedMotion={reducedMotion}>
          {loading ? (
            <SkeletonBlock lines={2} gap={spacing[2]} />
          ) : exceptions.length === 0 ? (
            <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
              No exceptions. Waive a blocking policy diagnostic from the Run panel&apos;s Issues tab.
            </div>
          ) : (
            sortExceptions(exceptions, now).map((exception) => {
              const status = exceptionStatus(exception, now);
              const busy = busyExceptionId === exception.id;
              const name = titles[exception.policy_code] ?? exception.policy_code;
              return (
                <div key={exception.id} style={rowStyle} data-testid="policy-exception">
                  <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                    <span style={{ ...typeScale.caption, fontWeight: 600, minWidth: 0, flex: 1 }}>{name}</span>
                    <StatusChip state={status.state} />
                  </div>
                  <div style={{ ...typeScale.caption, opacity: 0.75, marginTop: spacing[1], lineHeight: "16px" }}>
                    {exception.node_id ? (
                      <>
                        Node <span style={monoStyle}>{exception.node_id}</span> ·{" "}
                      </>
                    ) : (
                      "Whole graph · "
                    )}
                    {status.state === "expired" ? "expired" : "expires"} {formatExpiry(exception, now)}
                  </div>
                  {exception.reason && <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1] }}>“{exception.reason}”</div>}
                  <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Extend ${name} exception by 30 days`}
                      onClick={() =>
                        void exceptionAction(exception.id, () =>
                          client.policies.exceptions.update(exception.graph_id, exception.id, { expiresAt: extendExpiry(exception, 30) }),
                        )
                      }
                    >
                      {status.state === "expired" ? "Renew 30 days" : "Extend 30 days"}
                    </Button>
                    {pendingRevokeId === exception.id ? (
                      <>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void exceptionAction(exception.id, () => client.policies.exceptions.delete(exception.graph_id, exception.id))}
                        >
                          {busy ? "Revoking…" : "Confirm revoke"}
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setPendingRevokeId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" disabled={busy} aria-label={`Revoke ${name} exception`} onClick={() => setPendingRevokeId(exception.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<ExceptionState, { label: string; color: string }> = {
  active: { label: "Active", color: color.success[500] },
  expiring: { label: "Expiring soon", color: color.warning[500] },
  expired: { label: "Expired", color: color.error[500] },
};

function StatusChip({ state }: { state: ExceptionState }) {
  const style = STATUS_STYLE[state];
  return <span style={{ ...chipStyle, color: style.color, borderColor: style.color }}>{style.label}</span>;
}

const containerStyle = (layout: "rail" | "drawer"): CSSProperties => ({
  width: "100%",
  height: layout === "rail" ? "100%" : "auto",
  minHeight: 0,
  borderLeft: layout === "drawer" ? undefined : `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: layout === "rail" ? "hidden" : "visible",
});

const scrollerStyle: CSSProperties = { padding: shell.panelPadding, flex: 1, minHeight: 0, overflowY: "auto" };

const monoStyle: CSSProperties = { fontFamily: fontFamily.mono };

const rowStyle: CSSProperties = {
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  marginBottom: spacing[2],
};

const chipStyle: CSSProperties = {
  ...typeScale.caption,
  fontSize: 11,
  padding: "0 6px",
  borderRadius: 999,
  border: `1px solid ${surface.borderStrong}`,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const linkButtonStyle: CSSProperties = {
  ...typeScale.caption,
  marginLeft: "auto",
  background: "none",
  border: "none",
  padding: 0,
  color: color.primary[500],
  cursor: "pointer",
};
