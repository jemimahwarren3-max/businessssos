import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { StoreTemplate } from "@/lib/storefront/templates";

function Tile({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("block bg-white/80", className)} style={style} />;
}

function LayoutSketch({ template, accent }: { template: StoreTemplate; accent: string }) {
  if (template.heroStyle === "split") {
    return (
      <div className="grid h-full grid-cols-[1.5fr_1fr] gap-1.5 p-2">
        <Tile className="h-full rounded-sm" style={{ background: accent }} />
        <div className="grid grid-rows-2 gap-1.5">
          <Tile className="rounded-sm" />
          <Tile className="rounded-sm" />
        </div>
      </div>
    );
  }
  if (template.heroStyle === "full-bleed") {
    return (
      <div className="grid h-full grid-rows-[3fr_1fr] gap-1.5 p-2">
        <Tile className="rounded-sm" style={{ background: accent, opacity: 0.88 }} />
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Tile key={index} className="rounded-sm" />
          ))}
        </div>
      </div>
    );
  }
  if (template.heroStyle === "centered") {
    return (
      <div className="flex h-full flex-col items-center gap-2 p-2.5">
        <Tile className="h-1/4 w-2/5 rounded-full" style={{ background: accent }} />
        <div className="grid flex-1 grid-cols-3 gap-1.5 self-stretch">
          {Array.from({ length: 6 }).map((_, index) => (
            <Tile key={index} className="rounded-full" />
          ))}
        </div>
      </div>
    );
  }
  if (template.heroStyle === "compact") {
    return (
      <div className="flex h-full flex-col gap-1.5 p-2">
        <Tile className="h-1/5 rounded-sm" style={{ background: accent }} />
        <div className="grid flex-1 grid-cols-4 gap-1">
          {Array.from({ length: 12 }).map((_, index) => (
            <Tile key={index} className="rounded-sm" />
          ))}
        </div>
      </div>
    );
  }
  if (template.heroStyle === "side-panel") {
    return (
      <div className="grid h-full grid-cols-[1fr_1.5fr] gap-1.5 p-2">
        <div className="flex flex-col justify-center gap-1.5">
          <Tile className="h-1/3 rounded-sm" style={{ background: accent }} />
          <Tile className="h-2 rounded-sm" />
          <Tile className="h-2 w-2/3 rounded-sm" />
        </div>
        <div className="grid grid-rows-2 gap-1.5">
          <Tile className="rounded-sm" />
          <Tile className="rounded-sm" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 p-2.5">
      <Tile className="h-1/5 w-1/3 rounded-sm" style={{ background: accent }} />
      {Array.from({ length: 4 }).map((_, index) => (
        <span key={index} className="flex h-3 items-center gap-2 border-b border-white/40 pb-1">
          <Tile className="h-2 flex-1 rounded-sm" />
          <Tile className="h-2 w-8 rounded-sm" />
        </span>
      ))}
    </div>
  );
}

export function TemplatePreview({
  template,
  className,
}: {
  template: StoreTemplate;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border bg-muted/60", className)}
      style={{ background: `${template.defaultAccent}18` }}
      data-layout={template.layout}
      data-template={template.id}
      data-category={template.category}
      data-composition={template.heroStyle}
    >
      <LayoutSketch template={template} accent={template.defaultAccent} />
    </div>
  );
}
