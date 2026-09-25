import type { EdgeTransform } from "@bstockwelldev/agent-graph-sdk";
import { Field } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import { TextArea, TextInput } from "./ui/fields";

export type TransformType = EdgeTransform["type"];
type TargetType = NonNullable<EdgeTransform["target_type"]>;

const TYPE_OPTIONS: { value: TransformType | "none"; label: string; title: string }[] = [
  { value: "none", label: "None", title: "Pass the value through unchanged" },
  { value: "select", label: "Select", title: "Pick one field out of structured data" },
  { value: "wrap", label: "Wrap", title: "Put the value under a named field" },
  { value: "format_message", label: "Format", title: "Build a text message from the value" },
  { value: "coerce", label: "Coerce", title: "Convert to a string, number or boolean" },
];

const TARGET_OPTIONS: { value: TargetType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
];

/** A fresh transform of `type`, carrying over the matching field when switching back. */
export function defaultTransform(type: TransformType, previous?: EdgeTransform | null): EdgeTransform {
  if (type === "select") return { type, pointer: previous?.pointer ?? "/" };
  if (type === "wrap") return { type, field: previous?.field ?? "value" };
  if (type === "format_message") return { type, template: previous?.template ?? "{value}" };
  return { type, target_type: previous?.target_type ?? "string" };
}

/**
 * Editor for one deterministic transform (backend app/transforms.py) —
 * shared by the edge inspector and the transform node. `allowNone` adds a
 * "None" choice (edges); a transform node always has a type.
 */
export function TransformFields({
  value,
  onChange,
  allowNone = false,
}: {
  value: EdgeTransform | null;
  onChange: (next: EdgeTransform | null) => void;
  allowNone?: boolean;
}) {
  const options = allowNone ? TYPE_OPTIONS : TYPE_OPTIONS.filter((option) => option.value !== "none");
  return (
    <>
      <Field label="Transform">
        <SegmentedControl
          aria-label="Transform type"
          value={value?.type ?? "none"}
          options={options}
          onChange={(type) => onChange(type === "none" ? null : defaultTransform(type, value))}
        />
      </Field>
      {value?.type === "select" && (
        <Field label="Field path" hint="A JSON Pointer into the value, e.g. /answer or /items/0/name. Text is parsed as JSON first.">
          {(id) => (
            <TextInput id={id} value={value.pointer ?? ""} placeholder="/answer" spellCheck={false} onChange={(e) => onChange({ ...value, pointer: e.target.value })} />
          )}
        </Field>
      )}
      {value?.type === "wrap" && (
        <Field label="Field name" hint="The value becomes { field: value }.">
          {(id) => <TextInput id={id} value={value.field ?? ""} placeholder="topic" spellCheck={false} onChange={(e) => onChange({ ...value, field: e.target.value })} />}
        </Field>
      )}
      {value?.type === "format_message" && (
        <Field label="Message template" hint="Use {value} or {value.field.subfield}; write {{ and }} for literal braces.">
          {(id) => (
            <TextArea
              id={id}
              value={value.template ?? ""}
              placeholder="Topic: {value.topic}"
              spellCheck={false}
              rows={3}
              onChange={(e) => onChange({ ...value, template: e.target.value })}
            />
          )}
        </Field>
      )}
      {value?.type === "coerce" && (
        <Field label="Convert to" hint="Values that don't convert cleanly fail the step rather than guessing.">
          <SegmentedControl
            aria-label="Convert to"
            value={value.target_type ?? "string"}
            options={TARGET_OPTIONS}
            onChange={(target_type) => onChange({ ...value, target_type })}
          />
        </Field>
      )}
    </>
  );
}
