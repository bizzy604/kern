import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Terminal, Key, Loader2, Eye, EyeOff, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";

export default function Login() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { toast } = useToast();
  const { developer, refresh } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (developer) navigate("/");
  }, [developer, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.error ?? "Invalid API key.", variant: "destructive" });
        return;
      }
      await refresh();
      navigate("/");
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />

      <div className="relative w-full max-w-md space-y-8">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Terminal className="h-8 w-8 text-accent" />
            <span className="font-mono font-bold text-3xl tracking-tight text-foreground">KERN_</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Developer behavioral intelligence — private to you, synced from your terminal.
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground font-mono">Sign in</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Paste your API key to access your personal dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Key className="h-3 w-3" /> API Key
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type={revealed ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="kern_••••••••••••••••••••••••••••••••"
                  className="font-mono text-sm bg-background border-border flex-1"
                  autoFocus
                  autoComplete="off"
                  data-testid="input-api-key"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 flex-shrink-0"
                  onClick={() => setRevealed(v => !v)}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-background font-mono font-semibold h-10"
              disabled={loading || !apiKey.trim()}
              data-testid="button-login"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</>
                : <><ArrowRight className="h-4 w-4 mr-2" />Sign in</>}
            </Button>
          </form>

          {/* Help */}
          <div className="border-t border-border pt-5 space-y-3">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Don't have an account?</p>
            <div className="rounded-md bg-muted/20 border border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Install the CLI agent and register in seconds:
              </p>
              <pre className="text-xs font-mono text-foreground select-all bg-muted/30 rounded px-2 py-1.5">{`npm install -g kern-agent
kern register --endpoint ${window.location.origin}/api`}</pre>
            </div>
            <a
              href="https://github.com/bizzy604/kern#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Read the docs
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Your data is private. Only you can see your sessions, standups, and commits.
        </p>
      </div>
    </div>
  );
}
