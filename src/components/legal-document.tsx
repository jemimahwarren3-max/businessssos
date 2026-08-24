import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";

// Custom element renderers instead of a Tailwind typography plugin — these
// are the only two pages that render markdown-as-prose, so a full plugin
// dependency for that alone isn't worth it.
const markdownComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mt-8 text-2xl font-bold tracking-tight first:mt-0" {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mt-8 text-xl font-semibold tracking-tight" {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => <h3 className="mt-6 text-base font-semibold" {...p} />,
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-3 text-[15px] leading-relaxed text-foreground/90" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul
      className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90"
      {...p}
    />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol
      className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90"
      {...p}
    />
  ),
  li: (p: React.ComponentProps<"li">) => <li {...p} />,
  a: (p: React.ComponentProps<"a">) => (
    <a className="font-medium text-primary underline underline-offset-2" {...p} />
  ),
  strong: (p: React.ComponentProps<"strong">) => <strong className="font-semibold" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="mt-4 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-[14px] text-warning-foreground"
      {...p}
    />
  ),
  hr: () => <hr className="my-8 border-border" />,
  table: (p: React.ComponentProps<"table">) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold" {...p} />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border border-border px-3 py-2 align-top" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]" {...p} />
  ),
};

export function LegalDocument({ content }: { content: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo to="/" />
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </main>
    </div>
  );
}
