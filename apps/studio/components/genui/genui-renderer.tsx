"use client";

import type { GenuiNode, GenuiSurface } from "@/lib/genui";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Ported from micro-ui-agent-builder's components/genui-renderer.tsx as-is.
// Action dispatch stays inert (onClick -> console.info) — this was already
// flagged as a documented deviation during Phase 1 and isn't fixed here
// either, per the locked Phase 4e plan.
function GenuiNodeView({ node }: { node: GenuiNode }) {
  switch (node.type) {
    case "Stack": {
      const gap = node.props?.gap ?? 8;
      const row = node.props?.direction === "row";
      return (
        <div className={cn("flex", row ? "flex-row flex-wrap" : "flex-col")} style={{ gap }}>
          {node.children.map((child, i) => (
            <GenuiNodeView key={`stack-${i}`} node={child} />
          ))}
        </div>
      );
    }
    case "Text":
      return <p className="text-sm leading-relaxed">{node.props.content}</p>;
    case "Button":
      return (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            if (node.props.actionId) {
              console.info("GenUI action", node.props.actionId);
            }
          }}
        >
          {node.props.label}
        </Button>
      );
    case "Card":
      return (
        <div className="bg-card border-border rounded-md border p-3 shadow-sm">
          {node.props?.title ? <div className="mb-2 text-sm font-semibold">{node.props.title}</div> : null}
          <div className="space-y-2">
            {(node.children ?? []).map((child, i) => (
              <GenuiNodeView key={`card-${i}`} node={child} />
            ))}
          </div>
        </div>
      );
    case "FormField":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{node.props.label}</span>
          <Input
            readOnly
            type={node.props.inputType === "number" ? "number" : "text"}
            placeholder="Preview"
            aria-readonly
          />
        </label>
      );
    default: {
      const exhaustive: never = node;
      return <pre className="text-muted-foreground text-xs">{JSON.stringify(exhaustive)}</pre>;
    }
  }
}

export function GenuiSurfaceView({ surface }: { surface: GenuiSurface }) {
  return (
    <div className="bg-muted/30 border-border rounded-lg border p-4">
      <GenuiNodeView node={surface.root} />
    </div>
  );
}
