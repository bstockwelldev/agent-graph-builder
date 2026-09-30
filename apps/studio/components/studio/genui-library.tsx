"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { GenuiSurface } from "@/components/graph/ui/GenuiSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GENUI_CATALOG, GENUI_PATTERN, SAMPLE_DATA, surfaceJson, type GenuiCatalogEntry } from "@/lib/genuiCatalog";

function CopyJsonButton({ json, label }: { json: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Copy ${label} JSON`}
      onClick={() =>
        void navigator.clipboard?.writeText(json).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        )
      }
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy JSON"}
    </Button>
  );
}

function JsonBlock({ json, label }: { json: string; label: string }) {
  // Focusable so keyboard users can scroll it (max-h + overflow-auto).
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className="focus-visible:ring-primary/60 border-border bg-muted/40 text-foreground/90 max-h-56 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none"
    >
      {json}
    </pre>
  );
}

function ComponentCard({ entry }: { entry: GenuiCatalogEntry }) {
  const json = surfaceJson(entry.example);
  return (
    <Card id={`genui-${entry.type.toLowerCase()}`} aria-labelledby={`genui-${entry.type}-title`}>
      <CardHeader>
        <CardTitle id={`genui-${entry.type}-title`} className="font-mono">
          {entry.type}
        </CardTitle>
        <CardDescription>{entry.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GenuiSurface surface={{ root: entry.example }} data={SAMPLE_DATA} />
        <Table aria-label={`${entry.type} props`}>
          <TableHeader>
            <TableRow>
              <TableHead>Prop</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.props.map((prop) => (
              <TableRow key={prop.name}>
                <TableCell className="font-mono text-xs">
                  {prop.name}
                  {prop.required ? (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      required
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-normal">{prop.type}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-normal">{prop.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Example surface</span>
          <CopyJsonButton json={json} label={entry.type} />
        </div>
        <JsonBlock json={json} label={`${entry.type} example JSON`} />
      </CardContent>
    </Card>
  );
}

/** The /genui library body: a checkpoint pattern, then a card per component. */
export function GenuiLibrary() {
  const patternJson = surfaceJson(GENUI_PATTERN);
  return (
    <>
      <nav aria-label="Components" className="flex flex-wrap gap-2">
        {GENUI_CATALOG.map((entry) => (
          <a key={entry.type} href={`#genui-${entry.type.toLowerCase()}`} className="text-primary font-mono text-xs underline-offset-2 hover:underline">
            {entry.type}
          </a>
        ))}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Pattern · approval checkpoint</CardTitle>
          <CardDescription>
            A summary from the run to approve, the numbers behind it, and the answers the next nodes need. Previews on this page use sample run data
            for their $refs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GenuiSurface surface={{ root: GENUI_PATTERN }} data={SAMPLE_DATA} />
          <div className="flex justify-end">
            <CopyJsonButton json={patternJson} label="pattern" />
          </div>
          <JsonBlock json={patternJson} label="Pattern JSON" />
        </CardContent>
      </Card>
      <section aria-label="Component reference" className="grid gap-4 lg:grid-cols-2">
        {GENUI_CATALOG.map((entry) => (
          <ComponentCard key={entry.type} entry={entry} />
        ))}
      </section>
    </>
  );
}
