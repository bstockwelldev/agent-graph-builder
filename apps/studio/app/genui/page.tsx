import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";

// Stub for Phase 4c (route navigability only). The GenUI renderer and live
// schema docs port from MUI's genui-renderer.tsx in Phase 4e, alongside the
// run surface — action dispatch stays inert there too, per the locked plan.
export default function GenUiPage() {
  return (
    <StudioPage>
      <StudioPageHeader
        title="GenUI"
        description="LLM-generated UI surfaces, rendered from a schema-validated tree (Stack/Text/Button/Card/FormField)."
      />
      <div className="glass-panel ghost-border rounded-2xl border p-6">
        <p className="text-muted-foreground text-sm">
          The live GenUI renderer and schema reference land alongside the run surface in a later
          sub-phase. A <code className="font-mono text-xs">human_gate</code> node&apos;s{" "}
          <code className="font-mono text-xs">genuiCheckpointSurfaceJson</code> will render here.
        </p>
      </div>
    </StudioPage>
  );
}
