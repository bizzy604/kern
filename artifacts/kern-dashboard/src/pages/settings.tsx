import { useState, useEffect } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Github, Slack, Terminal, Shield, Bell, Key, Copy, Eye, EyeOff, ExternalLink } from "lucide-react";
import { SiJira, SiAsana } from "react-icons/si";

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    TEAM_LEAD: "border-accent/30 text-accent bg-accent/10",
    DEVELOPER: "border-border text-muted-foreground bg-muted/30",
  };
  const labels: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Team Lead", DEVELOPER: "Developer" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono border ${styles[role] || styles.DEVELOPER}`}>
      {labels[role] || role}
    </span>
  );
}

function ApiKeyCard() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("kern_api_key");
    if (stored) {
      setApiKey(stored);
      setLoading(false);
      return;
    }
    // The /developers/me/apikey endpoint requires the key itself — for the dashboard
    // we fetch it from the /developers/me endpoint which has it embedded in the DB.
    // Use a dedicated unauthenticated endpoint that returns the key for the local dashboard.
    fetch("/api/developers/me/apikey-local")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.apiKey) {
          setApiKey(d.apiKey);
          sessionStorage.setItem("kern_api_key", d.apiKey);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    toast({ title: "Copied", description: "API key copied to clipboard." });
  };

  const masked = apiKey ? `${apiKey.slice(0, 8)}${"•".repeat(24)}${apiKey.slice(-8)}` : null;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5" data-testid="card-api-key">
      <div className="flex items-center gap-3">
        <Key className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">CLI API Key</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        This key authenticates the <code className="font-mono bg-muted/40 px-1 rounded">kern</code> agent when it syncs sessions to your dashboard. Treat it like a password.
      </p>

      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : apiKey ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted/30 border border-border rounded px-3 py-2 text-foreground overflow-hidden text-ellipsis whitespace-nowrap" data-testid="api-key-value">
              {revealed ? apiKey : masked}
            </code>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0" onClick={() => setRevealed(v => !v)} data-testid="button-reveal-key">
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0" onClick={handleCopy} data-testid="button-copy-key">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-md bg-muted/20 border border-border p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-mono mb-2">Add to <code className="bg-muted/40 px-1 rounded">~/.kern/config.json</code>:</p>
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap select-all">{`{
  "api_endpoint": "${window.location.origin}/api",
  "api_key": "${revealed ? apiKey : masked}"
}`}</pre>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">API key not available</p>
      )}
    </div>
  );
}

interface Integration {
  name: string;
  description: string;
  connected: boolean;
  icon: React.ElementType;
  iconColor?: string;
  configNote?: string;
}

const integrations: Integration[] = [
  {
    name: "Slack",
    description: "Post standups to your team channel automatically",
    connected: false,
    icon: Slack,
    iconColor: "#4A154B",
    configNote: "Set SLACK_WEBHOOK_URL environment variable to enable",
  },
  { name: "Jira", description: "Sync work sessions with Jira issues and sprints", connected: false, icon: SiJira, iconColor: "#0052CC" },
  { name: "Asana", description: "Link sessions to Asana tasks and projects", connected: false, icon: SiAsana, iconColor: "#F95C5C" },
  { name: "GitHub", description: "Correlate sessions with commits and pull requests", connected: true, icon: Github },
];

function IntegrationCard({ integration }: { integration: Integration }) {
  const Icon = integration.icon;
  return (
    <div className="flex items-start justify-between p-4 rounded-lg border border-border bg-card hover:border-border/80 transition-colors" data-testid={`integration-card-${integration.name.toLowerCase()}`}>
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-md border border-border bg-muted/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="h-5 w-5" style={{ color: integration.iconColor || "currentColor" }} />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{integration.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{integration.description}</div>
          {integration.configNote && !integration.connected && (
            <div className="text-xs text-amber-400/80 mt-1.5 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              {integration.configNote}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {integration.connected ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-green-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded border border-border hover:border-destructive/30">
              Disconnect
            </button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
              <X className="h-3 w-3" /> Not connected
            </span>
            <button className="text-xs text-accent hover:text-accent/80 transition-colors px-2 py-1 rounded border border-accent/30 hover:border-accent/60 font-mono">
              Connect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: me, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey() },
  });

  return (
    <div className="space-y-8 max-w-2xl" data-testid="page-settings">
      <div>
        <h1 className="text-2xl font-bold font-mono text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Your profile, API key, and integration configuration</p>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : me ? (
          <div>
            <InfoRow label="Name" value={me.name} />
            <InfoRow label="Email" value={me.email} mono />
            <InfoRow label="GitHub" value={me.githubHandle ? `@${me.githubHandle}` : null} mono />
            <InfoRow label="Team" value={me.teamName} />
            <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Role</span>
              <RoleBadge role={me.role} />
            </div>
            <InfoRow label="Timezone" value={me.timezone} mono />
          </div>
        ) : null}
      </div>

      {/* API Key */}
      <ApiKeyCard />

      {/* Integrations */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Integrations</h2>
        </div>
        <p className="text-xs text-muted-foreground">Connect external tools to automatically sync your work sessions and post standups.</p>
        <div className="space-y-2">
          {integrations.map(integration => (
            <IntegrationCard key={integration.name} integration={integration} />
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: "Standup ready", desc: "Notify when your daily standup is generated" },
            { label: "Sync status", desc: "Alert if terminal plugin fails to sync for 30+ minutes" },
            { label: "Team updates", desc: "Weekly digest of team activity patterns" },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div>
                <div className="text-sm text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
              <div className="relative flex-shrink-0">
                <div className="h-5 w-9 rounded-full bg-accent/20 border border-accent/30 cursor-pointer hover:bg-accent/30 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal plugin */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Terminal Plugin</h2>
        </div>
        <div className="space-y-1">
          {[
            { label: "Shell integration", value: "Active — zsh + fish" },
            { label: "Sync frequency", value: "Every 5 minutes" },
            { label: "Local buffer", value: "30-day SQLite cache" },
            { label: "Auth", value: "Bearer token (API key above)" },
            { label: "Encryption", value: "TLS 1.3 in transit" },
          ].map(item => (
            <InfoRow key={item.label} label={item.label} value={item.value} mono />
          ))}
        </div>
      </div>
    </div>
  );
}
