import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { StoreLayout, StoreTemplate } from "@/lib/storefront/templates";

function Tile({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("block bg-white/80", className)} style={style} />;
}

function LayoutSketch({ layout, accent }: { layout: StoreLayout; accent: string }) {
  if (layout === "editorial") {
    return (
      <div className="grid h-full grid-cols-[1.4fr_1fr] gap-1.5 p-2">
        <Tile className="h-full rounded-md" style={{ background: accent, opacity: 0.85 }} />
        <div className="grid grid-rows-2 gap-1.5">
          <Tile className="rounded-md" />
          <Tile className="rounded-md" />
        </div>
      </div>
    );
  }
  if (layout === "soft") {
    return (
      <div className="grid h-full grid-cols-2 gap-2 p-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Tile
            key={i}
            className="rounded-full"
            style={{ background: i === 0 ? accent : undefined, opacity: i === 0 ? 0.8 : 1 }}
          />
        ))}
      </div>
    );
  }
  if (layout === "dense") {
    return (
      <div className="grid h-full grid-cols-4 grid-rows-3 gap-1 p-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Tile
            key={i}
            className="rounded-sm"
            style={{
              background: i % 5 === 0 ? accent : undefined,
              opacity: i % 5 === 0 ? 0.75 : 1,
            }}
          />
        ))}
      </div>
    );
  }
  if (layout === "menu") {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="flex h-3 items-center gap-2">
            <Tile className="h-3 flex-1 rounded-sm" />
            <Tile className="h-2 w-8 rounded-sm" style={{ background: accent, opacity: 0.8 }} />
          </span>
        ))}
      </div>
    );
  }
  if (layout === "luxury") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Tile className="h-[70%] w-2/5 rounded-sm" style={{ background: accent, opacity: 0.9 }} />
        <Tile className="h-1.5 w-1/3 rounded-sm" />
      </div>
    );
  }
  if (layout === "showcase") {
    return (
      <div className="flex h-full flex-col gap-1.5 p-2">
        <Tile className="h-1/2 rounded-md" style={{ background: accent, opacity: 0.8 }} />
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          <Tile className="rounded-sm" />
          <Tile className="rounded-sm" />
          <Tile className="rounded-sm" />
        </div>
      </div>
    );
  }
  if (layout === "wholesale") {
    return (
      <div className="flex h-full flex-col gap-1 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="grid flex-1 grid-cols-[2fr_1fr_1fr] gap-1">
            <Tile className="rounded-sm" />
            <Tile className="rounded-sm" />
            <Tile
              className="rounded-sm"
              style={{ background: i === 1 ? accent : undefined, opacity: i === 1 ? 0.75 : 1 }}
            />
          </span>
        ))}
      </div>
    );
  }
  if (layout === "social") {
    return (
      <div className="relative h-full p-2">
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Tile key={i} className="rounded-md" />
          ))}
        </div>
        <span
          className="absolute bottom-3 right-3 size-6 rounded-full"
          style={{ background: accent }}
        />
      </div>
    );
  }
  if (layout === "services") {
    return (
      <div className="grid h-full grid-cols-2 gap-2 p-3">
        <div className="flex flex-col gap-1.5">
          <Tile className="h-8 rounded-md" style={{ background: accent, opacity: 0.85 }} />
          <Tile className="flex-1 rounded-md" />
        </div>
        <div className="flex flex-col justify-end gap-1.5">
          <Tile className="h-3 rounded-sm" />
          <Tile className="h-8 rounded-md" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Tile
          key={i}
          className="rounded-md"
          style={{ background: i === 0 ? accent : undefined, opacity: i === 0 ? 0.85 : 1 }}
        />
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
    >
      <LayoutSketch layout={template.layout} accent={template.defaultAccent} />
    </div>
  );
}
