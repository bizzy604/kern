import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTodayStandup,
  useListStandups,
  useUpdateStandup,
  usePostStandupToSlack,
  getGetTodayStandupQueryKey,
  getListStandupsQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Check, X, Send, Clock, Bot, User, Sparkles, RefreshCw } from "lucide-react";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function SourceBadge({ source }: { source: string }) {
  return source === "AI" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border border-accent/30 text-accent bg-accent/10" data-testid="badge-source-ai">
      <Bot className="h-3 w-3" /> AI
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border border-blue-500/30 text-blue-400 bg-blue-500/10" data-testid="badge-source-manual">
      <User className="h-3 w-3" /> Edited
    </span>
  );
}

function useGenerateStandup(onChunk: (text: string) => void, onDone: () => void) {
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (generating) return;
    abortRef.current = new AbortController();
    setGenerating(true);
    onChunk(""); // reset

    try {
      const res = await fetch("/api/standups/generate", {
        method: "POST",
        signal: abortRef.current.signal,
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok || !res.body) throw new Error("Generation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.content) onChunk(json.content);
            if (json.done) { onDone(); return; }
            if (json.error) throw new Error(json.error);
          } catch (_) {}
        }
      }
      onDone();
    } catch (err: any) {
      if (err.name !== "AbortError") throw err;
    } finally {
      setGenerating(false);
    }
  };

  return { generate, generating };
}

function TodayStandup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [streamedContent, setStreamedContent] = useState("");

  const { data: todayData, isLoading } = useGetTodayStandup({
    query: { queryKey: getGetTodayStandupQueryKey() },
  });

  const updateStandup = useUpdateStandup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayStandupQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStandupsQueryKey() });
        setEditing(false);
        toast({ title: "Standup updated", description: "Your standup has been saved." });
      },
    },
  });

  const postToSlack = usePostStandupToSlack({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayStandupQueryKey() });
        toast({ title: "Posted to Slack", description: "Your standup has been shared with the team." });
      },
      onError: () => {
        toast({ title: "Post failed", description: "Could not post to Slack.", variant: "destructive" });
      },
    },
  });

  const { generate, generating } = useGenerateStandup(
    (chunk) => setStreamedContent(prev => chunk === "" ? "" : prev + chunk),
    () => {
      queryClient.invalidateQueries({ queryKey: getGetTodayStandupQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListStandupsQueryKey() });
      setStreamedContent("");
      toast({ title: "Standup generated", description: "Claude wrote your standup from today's activity." });
    },
  );

  const standup = todayData?.standup;

  const handleGenerate = async () => {
    try {
      await generate();
    } catch {
      toast({ title: "Generation failed", description: "Could not reach the AI. Try again.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-36" />
      </div>
    );
  }

  // Show streaming state
  if (generating || streamedContent) {
    return (
      <div className="rounded-lg border border-accent/30 bg-card p-6 space-y-4" data-testid="standup-generating">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono border border-accent/30 text-accent bg-accent/10">
            <Bot className="h-3 w-3" />
            {generating ? "Generating…" : "AI"}
          </span>
          {generating && (
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap min-h-[80px] font-mono">
          {streamedContent}
          {generating && <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse align-text-bottom" />}
        </div>
      </div>
    );
  }

  if (!standup) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-5" data-testid="standup-empty-today">
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <div className="h-12 w-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">No standup yet today</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click Generate and Claude will write your standup from your recent sessions and commits — takes about 5 seconds.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-accent hover:bg-accent/90 text-background font-mono"
            data-testid="button-generate-standup"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with Claude
          </Button>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    setEditContent(standup.content);
    setEditing(true);
  };

  const handleSave = () => {
    if (!editContent.trim()) return;
    updateStandup.mutate({ id: standup.id, data: { content: editContent } });
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent("");
  };

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-6 space-y-4" data-testid="standup-today">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Today's Standup</h2>
          <SourceBadge source={standup.source} />
          {standup.postedToSlack && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border border-green-500/30 text-green-400 bg-green-500/10" data-testid="badge-posted-slack">
              <Check className="h-3 w-3" /> Posted
            </span>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="h-8 text-xs text-muted-foreground"
              data-testid="button-regenerate-standup"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Regenerate
            </Button>
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 text-xs" data-testid="button-edit-standup">
              <Edit2 className="h-3 w-3 mr-1" /> Edit
            </Button>
            {!standup.postedToSlack && (
              <Button
                size="sm"
                className="h-8 text-xs bg-accent hover:bg-accent/90 text-background"
                onClick={() => postToSlack.mutate({ id: standup.id })}
                disabled={postToSlack.isPending}
                data-testid="button-post-slack"
              >
                <Send className="h-3 w-3 mr-1" />
                {postToSlack.isPending ? "Posting…" : "Post to Slack"}
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="min-h-[140px] text-sm font-mono bg-background border-border text-foreground resize-none"
            data-testid="textarea-standup-edit"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={updateStandup.isPending} className="h-8 text-xs bg-accent hover:bg-accent/90 text-background" data-testid="button-save-standup">
              <Check className="h-3 w-3 mr-1" />
              {updateStandup.isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8 text-xs" data-testid="button-cancel-edit">
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-standup-content">
          {standup.content}
        </p>
      )}
    </div>
  );
}

export default function Standups() {
  const { data: standupsData, isLoading } = useListStandups(
    { limit: 10, offset: 0 },
    { query: { queryKey: getListStandupsQueryKey({ limit: 10, offset: 0 }) } },
  );

  const standups = standupsData?.standups ?? [];
  const today = new Date().toISOString().split("T")[0];
  const pastStandups = standups.filter(s => s.date !== today);

  return (
    <div className="space-y-8" data-testid="page-standups">
      <div>
        <h1 className="text-2xl font-bold font-mono text-foreground">Standups</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Claude reads your sessions &amp; commits and writes your standup — edit and post to Slack when ready
        </p>
      </div>

      <TodayStandup />

      {/* History */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">History</h2>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)
        ) : pastStandups.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No past standups yet
          </div>
        ) : (
          <div className="space-y-3">
            {pastStandups.map(s => (
              <div key={s.id} className="rounded-lg border border-border bg-card p-5 space-y-3 hover:border-border/80 transition-colors" data-testid={`standup-history-${s.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{formatDate(s.date)}</span>
                    <SourceBadge source={s.source} />
                    {s.postedToSlack && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border border-green-500/30 text-green-400 bg-green-500/10">
                        <Check className="h-3 w-3" /> Posted
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(s.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
