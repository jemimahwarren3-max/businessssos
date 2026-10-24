import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { askAssistantFn } from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant | Kwetuu" },
      {
        name: "description",
        content: "Ask questions about your business and get answers grounded in your real data.",
      },
      { property: "og:title", content: "AI Assistant | Kwetuu" },
      { property: "og:description", content: "Don't just see your data. Understand it." },
    ],
  }),
  component: Assistant,
});

const SUGGESTIONS = [
  "How did my business perform this month?",
  "What products are running low?",
  "Who owes me money right now?",
  "Which products are my best sellers?",
];

type Message = { role: "user" | "assistant"; content: string };

function Assistant() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canUse = hasPermission(workspace.data, "ai.use");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askAssistantFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const askMutation = useMutation({
    mutationFn: async (nextMessages: Message[]) =>
      askFn({ data: { businessId: businessId!, messages: nextMessages } }),
    onSuccess: (result) => {
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    },
    onError: (error: Error) => {
      toast.error(readableError(error, "The assistant couldn't answer that. Please try again."));
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  function send(text: string) {
    const content = text.trim();
    if (!content || askMutation.isPending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    askMutation.mutate(next);
  }

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!canUse) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        isReadOnly={workspace.data.isReadOnly}
        billingEnabled={workspace.data.billingEnabled}
        title="AI Assistant"
        subtitle="Ask questions about your business."
      >
        <div className="surface px-6 py-16 text-center">
          <Sparkles className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Your role can't use the assistant</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner, admin or manager for access, the assistant shares financial data.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="AI Assistant"
      subtitle="Answers are grounded in your last 30 days of data, nothing is invented."
      actions={
        messages.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setMessages([])}>
            New conversation
          </Button>
        ) : null
      }
    >
      <div className="surface flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ask about your business</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Sales, profit, stock, and who owes you money, answered from your real numbers.
                </p>
              </div>
              <div className="grid w-full max-w-md gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-lg border border-border px-3 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`grid size-7 shrink-0 place-items-center rounded-full ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Bot className="size-3.5" aria-hidden="true" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {askMutation.isPending ? (
                <div className="flex items-start gap-2.5">
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted">
                    <Bot className="size-3.5" aria-hidden="true" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Thinking…
                  </div>
                </div>
              ) : null}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Message"
            placeholder="Ask about sales, stock, customers…"
            rows={1}
            className="max-h-32 min-h-[42px] resize-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={askMutation.isPending || !input.trim()}
            aria-label="Send"
          >
            {askMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
