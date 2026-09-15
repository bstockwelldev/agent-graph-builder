import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <div className="glass-panel ghost-border rounded-2xl border p-8">
        <h1 className="font-heading text-2xl font-semibold">Agent Graph Studio</h1>
        <p className="mt-2 text-muted-foreground">
          Design-system smoke test — routed pages land in later sub-phases.
        </p>
        <Button className="mt-4">Compile</Button>
      </div>
    </main>
  );
}
