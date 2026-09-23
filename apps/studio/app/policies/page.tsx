"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EffectivePolicyRule, GraphDefinition, PolicyEnforcement, PolicyException, PolicySettings } from "@bstockwelldev/agent-graph-sdk";

import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { client } from "@/lib/api-client";
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
  type ExceptionState,
} from "@/lib/policies";
import { cn } from "@/lib/utils";

// Workspace policies (STO-608): the defaults every graph inherits unless its
// own Policies panel overrides a rule, plus every graph's time-boxed
// exceptions in one place so expiring waivers get noticed. Changes save
// immediately; the backend re-evaluates on the next validate/compile/publish.

const DEFAULT = "default";
const CATEGORIES = ["security", "reliability", "cost", "governance"] as const;

const STATE_BADGE: Record<ExceptionState, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400" },
  expiring: { label: "Expiring soon", className: "bg-amber-500/15 text-amber-400" },
  expired: { label: "Expired", className: "bg-destructive/15 text-destructive" },
};

type ExceptionFilter = "all" | "open" | "expired";

export default function PoliciesPage() {
  const [rules, setRules] = useState<EffectivePolicyRule[]>([]);
  const [settings, setSettings] = useState<PolicySettings["rules"]>({});
  const [exceptions, setExceptions] = useState<PolicyException[]>([]);
  const [graphNames, setGraphNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExceptionFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [effective, workspace, allExceptions, graphs] = await Promise.all([
        client.getEffectivePolicies(),
        client.getWorkspacePolicies(),
        client.listAllPolicyExceptions(),
        client.listGraphs().catch(() => [] as GraphDefinition[]),
      ]);
      setRules(effective);
      setSettings(workspace.rules);
      setSavedAt(workspace.updated_at ?? null);
      setExceptions(allExceptions);
      setGraphNames(Object.fromEntries(graphs.map((graph) => [graph.id, graph.name])));
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: PolicySettings["rules"]) => {
      const previous = settings;
      setSettings(next);
      setSaving(true);
      setError(null);
      try {
        const saved = await client.saveWorkspacePolicies({ rules: next });
        setSavedAt(saved.updated_at ?? null);
        setRules(await client.getEffectivePolicies());
      } catch (err) {
        setSettings(previous);
        setError(errorDetail(err));
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  const exceptionAction = useCallback(async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setExceptions(await client.listAllPolicyExceptions());
      setPendingRevokeId(null);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setBusyId(null);
    }
  }, []);

  const now = Date.now();
  const titles = useMemo(() => Object.fromEntries(rules.map((rule) => [rule.rule.code, rule.rule.title])), [rules]);
  const visibleExceptions = sortExceptions(exceptions, now).filter((exception) => {
    const state = exceptionStatus(exception, now).state;
    return filter === "all" || (filter === "expired" ? state === "expired" : state !== "expired");
  });
  const counts = exceptions.reduce(
    (acc, exception) => {
      acc[exceptionStatus(exception, now).state] += 1;
      return acc;
    },
    { active: 0, expiring: 0, expired: 0 } as Record<ExceptionState, number>,
  );

  return (
    <StudioPage>
      <StudioPageHeader
        title="Policies"
        description="Workspace defaults for the security, reliability, cost and governance checks every graph runs. A graph can override a rule from its own Policies panel."
        loading={loading}
        onRefresh={() => void load()}
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs" role="status">
        {saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "Using built-in defaults"}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {CATEGORIES.map((category) => {
          const categoryRules = rules.filter((rule) => rule.rule.category === category);
          if (categoryRules.length === 0) return null;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">{CATEGORY_LABEL[category]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {categoryRules.map((rule) => (
                  <RuleRow key={rule.rule.code} rule={rule} settings={settings} disabled={saving} onChange={(next) => void save(next)} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exceptions</CardTitle>
          <CardDescription>
            Time-boxed waivers granted from each graph&apos;s Run panel. {counts.expiring} expiring soon · {counts.active} active · {counts.expired} expired.
          </CardDescription>
          <div role="group" aria-label="Filter exceptions" className="flex gap-1 pt-2">
            {(
              [
                ["open", "Active"],
                ["expired", "Expired"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {visibleExceptions.length === 0 ? (
            <p className="text-muted-foreground text-sm" role="status">
              {exceptions.length === 0 ? "No exceptions granted yet." : "Nothing in this view."}
            </p>
          ) : (
            <ul className="divide-border divide-y" aria-label="Policy exceptions">
              {visibleExceptions.map((exception) => {
                const state = exceptionStatus(exception, now).state;
                const busy = busyId === exception.id;
                const name = titles[exception.policy_code] ?? exception.policy_code;
                return (
                  <li key={exception.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{name}</span>
                        <Badge className={cn("border-0", STATE_BADGE[state].className)}>{STATE_BADGE[state].label}</Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        <Link href={`/graphs/${exception.graph_id}`} className="text-primary hover:underline">
                          {graphNames[exception.graph_id] ?? exception.graph_id}
                        </Link>
                        {exception.node_id ? (
                          <>
                            {" · node "}
                            <span className="font-mono">{exception.node_id}</span>
                          </>
                        ) : null}
                        {" · "}
                        {state === "expired" ? "expired" : "expires"} {formatExpiry(exception, now)}
                        {exception.reason ? ` · “${exception.reason}”` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Extend ${name} exception on ${graphNames[exception.graph_id] ?? exception.graph_id} by 30 days`}
                        onClick={() => void exceptionAction(exception.id, () => client.updatePolicyException(exception.graph_id, exception.id, extendExpiry(exception, 30)))}
                      >
                        {state === "expired" ? "Renew 30 days" : "Extend 30 days"}
                      </Button>
                      {pendingRevokeId === exception.id ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void exceptionAction(exception.id, () => client.deletePolicyException(exception.graph_id, exception.id))}
                          >
                            Confirm revoke
                          </Button>
                          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPendingRevokeId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPendingRevokeId(exception.id)}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </StudioPage>
  );
}

function RuleRow({
  rule,
  settings,
  disabled,
  onChange,
}: {
  rule: EffectivePolicyRule;
  settings: PolicySettings["rules"];
  disabled: boolean;
  onChange: (next: PolicySettings["rules"]) => void;
}) {
  const code = rule.rule.code;
  const setting = settings[code];
  const selectId = `policy-${code}`;
  const defaultLabel = `Default (${enforcementLabel(rule.rule.default_enforcement)})`;
  return (
    <div className="space-y-2" data-testid={`policy-rule-${code}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={selectId} className="text-sm font-medium">
          {rule.rule.title}
        </Label>
        {rule.rule.gate === "publish" ? <Badge variant="outline">Publish only</Badge> : null}
      </div>
      <p className="text-muted-foreground text-xs leading-snug">{rule.rule.description}</p>
      <Select
        value={setting?.enforcement ?? DEFAULT}
        disabled={disabled}
        onValueChange={(value) => value && onChange(setRuleEnforcement(settings, code, value === DEFAULT ? null : (value as PolicyEnforcement)))}
        items={{ [DEFAULT]: defaultLabel, ...Object.fromEntries(ENFORCEMENT_OPTIONS.map((option) => [option.value, option.label])) }}
      >
        <SelectTrigger id={selectId} aria-label={`${rule.rule.title} enforcement`} className="h-8 w-full sm:w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>{defaultLabel}</SelectItem>
          {ENFORCEMENT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label} — <span className="text-muted-foreground">{option.description}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rule.rule.params.map((spec) => {
        const overridden = setting?.params?.[spec.name] !== undefined;
        const value = rule.params[spec.name] ?? spec.default;
        const inputId = `${selectId}-${spec.name}`;
        return (
          <div key={spec.name} className="flex flex-wrap items-center gap-2">
            <Label htmlFor={inputId} className="text-muted-foreground text-xs">
              {spec.label}
            </Label>
            {spec.type === "integer" ? (
              <IntegerInput
                id={inputId}
                value={Number(value)}
                min={spec.minimum ?? 0}
                disabled={disabled}
                onCommit={(next) => onChange(setRuleParam(settings, code, spec.name, next))}
              />
            ) : (
              <Select
                value={String(value)}
                disabled={disabled}
                onValueChange={(next) => next && onChange(setRuleParam(settings, code, spec.name, next))}
                items={Object.fromEntries((spec.choices ?? []).map((choice) => [choice, choice]))}
              >
                <SelectTrigger id={inputId} className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(spec.choices ?? []).map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {overridden ? (
              <Button type="button" size="sm" variant="link" className="h-7 px-1 text-xs" disabled={disabled} onClick={() => onChange(setRuleParam(settings, code, spec.name, undefined))}>
                Reset to {String(spec.default)}
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">default</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Commits on blur/Enter so typing "12" doesn't save "1" first. */
function IntegerInput({ id, value, min, disabled, onCommit }: { id: string; value: number; min: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      value={draft}
      disabled={disabled}
      className="h-8 w-24"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}
