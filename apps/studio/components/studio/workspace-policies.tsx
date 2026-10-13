"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EffectivePolicyRule, GraphSummary, PolicyEnforcement, PolicyException, PolicySettings } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/graph/ui/Button";
import { Card } from "@/components/graph/ui/Card";
import { Chip, type ChipTone } from "@/components/graph/ui/Chip";
import { Combobox, type ComboboxOption } from "@/components/graph/ui/Combobox";
import { TextInput } from "@/components/graph/ui/fields";
import { ScopeSelect } from "@/components/studio/scope-select";
import { useGraphScope } from "@/hooks/use-graph-scope";
import { client } from "@/lib/api-client";
import { accentSurface, border, color, fontFamily, localType, spacing, text, typeScale } from "@/lib/graph-theme";
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
} from "@bstockwelldev/agent-graph-sdk/graph";

// Workspace policies (STO-608), the "workspacePolicies" workbench panel: the
// defaults every graph inherits unless its own Policies panel overrides a
// rule, plus every graph's time-boxed exceptions in one place so expiring
// waivers get noticed. Changes save immediately; the backend re-evaluates on
// the next validate/compile/publish. With a graph in scope (slice 4) it edits
// that graph's overrides instead, shows where each rule's setting comes from,
// and lists only that graph's exceptions. Styled from the canvas tokens and
// the graph kit (canvas-styling-plan.md, PR 2).

const DEFAULT = "default";
const CATEGORIES = ["security", "reliability", "cost", "governance"] as const;

const SOURCE_LABEL: Record<EffectivePolicyRule["enforcement_source"], string> = {
  default: "Default",
  workspace: "Workspace",
  graph: "This graph",
};

const STATE_TONE: Record<ExceptionState, { label: string; tone: ChipTone }> = {
  active: { label: "Active", tone: "success" },
  expiring: { label: "Expiring soon", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
};

type ExceptionFilter = "all" | "open" | "expired";

export function WorkspacePolicies() {
  const scope = useGraphScope();
  const graphId = scope.graphId;
  const [rules, setRules] = useState<EffectivePolicyRule[]>([]);
  // The workspace's resolution, for "Inherit (…)" labels in graph scope.
  const [inherited, setInherited] = useState<Record<string, EffectivePolicyRule>>({});
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
    if (!scope.ready) return;
    setLoading(true);
    setError(null);
    try {
      const [effective, workspaceEffective, stored, allExceptions, graphs] = await Promise.all([
        client.policies.effective(graphId ? { graphId } : {}),
        graphId ? client.policies.effective() : Promise.resolve(null),
        graphId ? client.policies.graph.get(graphId) : client.policies.workspace.get(),
        client.policies.exceptions.list(graphId ? { graphId } : {}),
        client.graphs.summaries.list().catch(() => [] as GraphSummary[]),
      ]);
      setRules(effective);
      setInherited(Object.fromEntries((workspaceEffective ?? []).map((rule) => [rule.rule.code, rule])));
      setSettings(stored.rules);
      setSavedAt(stored.updated_at ?? null);
      setExceptions(allExceptions);
      setGraphNames(Object.fromEntries(graphs.map((graph) => [graph.id, graph.name])));
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setLoading(false);
    }
  }, [graphId, scope.ready]);

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
        const saved = graphId ? await client.policies.graph.save(graphId, { rules: next }) : await client.policies.workspace.save({ rules: next });
        setSavedAt(saved.updated_at ?? null);
        setRules(await client.policies.effective(graphId ? { graphId } : {}));
      } catch (err) {
        setSettings(previous);
        setError(errorDetail(err));
      } finally {
        setSaving(false);
      }
    },
    [graphId, settings],
  );

  const exceptionAction = useCallback(async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setExceptions(await client.policies.exceptions.list(graphId ? { graphId } : {}));
      setPendingRevokeId(null);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setBusyId(null);
    }
  }, [graphId]);

  const now = Date.now();
  const graph = scope.graph;
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

  const description = graph
    ? `${graph.name}'s overrides of the workspace rules. A rule left on Inherit follows the workspace, which follows the built-in default.`
    : "Workspace defaults for the security, reliability, cost and governance checks every graph runs. A graph can override a rule from its own Policies panel, or here with the graph in scope.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[3], padding: spacing[3], color: text.primary }}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
        <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>{description}</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing[2] }}>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <ScopeSelect scope={scope} />
          </div>
          {/* Not disabled while loading: a disabled button fades back in when the load ends, and a scan
              that lands mid-fade sees low contrast. */}
          <Button variant="ghost" aria-busy={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, ...localType.ui, color: accentSurface.destructive.text }}>
          {error}
        </p>
      ) : null}
      <p role="status" style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>
        {saving
          ? "Saving…"
          : savedAt
            ? `Saved ${new Date(savedAt).toLocaleString()}`
            : graph
              ? "No overrides: this graph follows the workspace"
              : "Using built-in defaults"}
      </p>

      {CATEGORIES.map((category) => {
        const categoryRules = rules.filter((rule) => rule.rule.category === category);
        if (categoryRules.length === 0) return null;
        return (
          <Card key={category} title={CATEGORY_LABEL[category]}>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              {categoryRules.map((rule) => (
                <RuleRow
                  key={rule.rule.code}
                  rule={rule}
                  inherited={graphId ? (inherited[rule.rule.code] ?? null) : null}
                  settings={settings}
                  disabled={saving}
                  onChange={(next) => void save(next)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      <Card
        title="Exceptions"
        description={`${graph ? `Time-boxed waivers on ${graph.name}.` : "Time-boxed waivers granted from each graph's Run panel."} ${counts.expiring} expiring soon · ${counts.active} active · ${counts.expired} expired.`}
      >
        <div role="group" aria-label="Filter exceptions" style={{ display: "flex", gap: spacing[1], marginBottom: spacing[2] }}>
          {(
            [
              ["open", "Active"],
              ["expired", "Expired"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              aria-pressed={filter === value}
              variant={filter === value ? "secondary" : "ghost"}
              onClick={() => setFilter(value)}
              style={filter === value ? { borderColor: border.focus } : undefined}
            >
              {label}
            </Button>
          ))}
        </div>
        {visibleExceptions.length === 0 ? (
          <p role="status" style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>
            {exceptions.length === 0 ? "No exceptions granted yet." : "Nothing in this view."}
          </p>
        ) : (
          <ul aria-label="Policy exceptions" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visibleExceptions.map((exception, index) => {
              const state = exceptionStatus(exception, now).state;
              const busy = busyId === exception.id;
              const name = titles[exception.policy_code] ?? exception.policy_code;
              const graphName = graphNames[exception.graph_id] ?? exception.graph_id;
              return (
                <li
                  key={exception.id}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2], padding: `${spacing[3]}px 0`, borderTop: index === 0 ? "none" : `1px solid ${border.subtle}` }}
                >
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}>
                      <span style={{ ...localType.ui, fontWeight: 600 }}>{name}</span>
                      <Chip tone={STATE_TONE[state].tone}>{STATE_TONE[state].label}</Chip>
                    </div>
                    <p style={{ margin: "2px 0 0", ...typeScale.caption, color: text.secondary }}>
                      <Link href={`/graphs/${exception.graph_id}`} className="agb-focus-ring" style={{ color: color.primary[500] }}>
                        {graphName}
                      </Link>
                      {exception.node_id ? (
                        <>
                          {" · node "}
                          <span style={{ fontFamily: fontFamily.mono }}>{exception.node_id}</span>
                        </>
                      ) : null}
                      {" · "}
                      {state === "expired" ? "expired" : "expires"} {formatExpiry(exception, now)}
                      {exception.reason ? ` · “${exception.reason}”` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: spacing[2] }}>
                    <Button
                      disabled={busy}
                      aria-label={`Extend ${name} exception on ${graphName} by 30 days`}
                      onClick={() => void exceptionAction(exception.id, () => client.policies.exceptions.update(exception.graph_id, exception.id, { expiresAt: extendExpiry(exception, 30) }))}
                    >
                      {state === "expired" ? "Renew 30 days" : "Extend 30 days"}
                    </Button>
                    {pendingRevokeId === exception.id ? (
                      <>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void exceptionAction(exception.id, () => client.policies.exceptions.delete(exception.graph_id, exception.id))}
                        >
                          Confirm revoke
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setPendingRevokeId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" disabled={busy} onClick={() => setPendingRevokeId(exception.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RuleRow({
  rule,
  inherited,
  settings,
  disabled,
  onChange,
}: {
  rule: EffectivePolicyRule;
  /** Graph scope: the workspace's resolution this graph inherits. */
  inherited: EffectivePolicyRule | null;
  settings: PolicySettings["rules"];
  disabled: boolean;
  onChange: (next: PolicySettings["rules"]) => void;
}) {
  const code = rule.rule.code;
  const setting = settings[code];
  const selectId = `policy-${code}`;
  const defaultLabel = inherited
    ? `Inherit (${enforcementLabel(inherited.enforcement)})`
    : `Default (${enforcementLabel(rule.rule.default_enforcement)})`;
  const enforcementOptions: ComboboxOption[] = [
    { value: DEFAULT, label: defaultLabel },
    ...ENFORCEMENT_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.description })),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }} data-testid={`policy-rule-${code}`}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}>
        <label htmlFor={selectId} style={{ ...localType.ui, fontWeight: 600 }}>
          {rule.rule.title}
        </label>
        {rule.rule.gate === "publish" ? <Chip>Publish only</Chip> : null}
        {inherited ? (
          <Chip tone="neutral" aria-label={`Set by: ${SOURCE_LABEL[rule.enforcement_source]}`}>
            {SOURCE_LABEL[rule.enforcement_source]}
          </Chip>
        ) : null}
      </div>
      <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>{rule.rule.description}</p>
      <div style={{ maxWidth: 280 }}>
        <Combobox
          id={selectId}
          aria-label={`${rule.rule.title} enforcement`}
          value={setting?.enforcement ?? DEFAULT}
          options={enforcementOptions}
          disabled={disabled}
          searchPlaceholder="Find a setting…"
          onChange={(value) => onChange(setRuleEnforcement(settings, code, value === DEFAULT ? null : (value as PolicyEnforcement)))}
        />
      </div>
      {rule.rule.params.map((spec) => {
        const overridden = setting?.params?.[spec.name] !== undefined;
        const value = rule.params[spec.name] ?? spec.default;
        const inputId = `${selectId}-${spec.name}`;
        return (
          <div key={spec.name} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}>
            <label htmlFor={inputId} style={{ ...typeScale.caption, color: text.secondary }}>
              {spec.label}
            </label>
            {spec.type === "integer" ? (
              <IntegerInput
                id={inputId}
                value={Number(value)}
                min={spec.minimum ?? 0}
                disabled={disabled}
                onCommit={(next) => onChange(setRuleParam(settings, code, spec.name, next))}
              />
            ) : (
              <div style={{ width: 160 }}>
                <Combobox
                  id={inputId}
                  aria-label={spec.label}
                  value={String(value)}
                  options={(spec.choices ?? []).map((choice) => ({ value: choice, label: choice }))}
                  disabled={disabled}
                  searchPlaceholder="Find a choice…"
                  onChange={(next) => next && onChange(setRuleParam(settings, code, spec.name, next))}
                />
              </div>
            )}
            {overridden ? (
              <Button variant="ghost" disabled={disabled} onClick={() => onChange(setRuleParam(settings, code, spec.name, undefined))}>
                {inherited ? `Inherit (${String(inherited.params[spec.name] ?? spec.default)})` : `Reset to ${String(spec.default)}`}
              </Button>
            ) : (
              <span style={{ ...typeScale.caption, color: text.secondary }}>{inherited ? (rule.param_sources[spec.name] ?? "default") : "default"}</span>
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
    <TextInput
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      value={draft}
      disabled={disabled}
      style={{ width: 96 }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}
