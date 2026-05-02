import { useState, useEffect, useCallback } from "react";
import { useGetMe, getGetMeQueryKey, type Developer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Check, X, Github, Slack, Terminal, Shield, Bell, Key,
  Copy, Eye, EyeOff, ExternalLink, Loader2, Unplug, Plug, Pencil,
  Users, RefreshCw,
} from "lucide-react";
import { SiJira, SiAsana } from "react-icons/si";

/* ─── helpers ─────────────────────────────────────────────────── */

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-muted-foreground">—</span>}
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

/* ─── Copy row ─────────────────────────────────────────────────── */

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono bg-muted/30 border border-border rounded px-3 py-2 text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
          {value}
        </code>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0"
          onClick={() => { navigator.clipboard.writeText(value); toast({ title: "Copied", description: `${label} copied to clipboard.` }); }}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Invite teammates card ────────────────────────────────────── */

interface InviteData {
  inviteCode: string | null;
  teamName: string | null;
  teamId: number | null;
  solo?: boolean;
}

function InviteCard() {
  const { toast } = useToast();
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const endpoint = `${window.location.origin}/api`;

  const fetchCode = useCallback(() => {
    setLoading(true);
    fetch("/api/teams/invite-code", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCode(); }, [fetchCode]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch("/api/teams/regenerate-invite", { method: "POST", credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setData(prev => prev ? { ...prev, inviteCode: d.inviteCode } : prev);
        toast({ title: "Invite code regenerated", description: "The old code is now invalid. Share the new command below." });
      }
    } catch {
      toast({ title: "Error", description: "Could not regenerate code.", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const inviteCode = data?.inviteCode ?? null;
  const teamName = data?.teamName ?? null;
  const registerCmd = inviteCode
    ? `kern register --endpoint ${endpoint} --team-code ${inviteCode}`
    : `kern register --endpoint ${endpoint}`;

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Invite Teammates</h2>
        </div>
        {inviteCode && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground border border-border"
            onClick={regenerate} disabled={regenerating}>
            {regenerating
              ? <><Loader2 className="h-3 w-3 animate-spin" />Regenerating…</>
              : <><RefreshCw className="h-3 w-3" />New code</>}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : data?.solo ? (
        <p className="text-xs text-muted-foreground">
          You are not currently in a team. Contact your admin or register a team in the database to enable team invites.
        </p>
      ) : (
        <div className="space-y-4">
          {teamName && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Team</span>
              <span className="text-xs font-mono text-foreground bg-accent/10 border border-accent/20 px-2 py-0.5 rounded">{teamName}</span>
            </div>
          )}

          {/* Invite code display */}
          {inviteCode && (
            <div className="space-y-1.5">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Team Invite Code</span>
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center justify-center rounded-md bg-muted/20 border border-accent/20 py-3">
                  <span className="text-2xl font-mono font-bold text-accent tracking-[0.3em]">{inviteCode}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-12 w-12 p-0 flex-shrink-0"
                  onClick={() => { navigator.clipboard.writeText(inviteCode); toast({ title: "Code copied" }); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Ready-to-share command */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Share this command with teammates</p>
            <div className="flex items-center gap-2">
              <pre className="flex-1 text-xs font-mono text-foreground bg-muted/30 border border-border rounded px-3 py-2 overflow-x-auto whitespace-nowrap select-all">
                {registerCmd}
              </pre>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(registerCmd); toast({ title: "Command copied", description: "Send this to your teammate." }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-md bg-muted/10 border border-border px-4 py-3 space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">How it works</p>
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li><span className="text-foreground font-mono">1.</span> Teammate installs: <code className="bg-muted/40 px-1 rounded font-mono">npm install -g kern-agent</code></li>
              <li><span className="text-foreground font-mono">2.</span> They run the command above — it creates their account and joins <span className="text-foreground">{teamName ?? "your team"}</span> automatically</li>
              <li><span className="text-foreground font-mono">3.</span> They run <code className="bg-muted/40 px-1 rounded font-mono">kern init</code> to start tracking — their data appears on the Team page</li>
            </ol>
          </div>

          {inviteCode && (
            <p className="text-xs text-muted-foreground">
              Anyone with this code can join your team. Click <span className="text-foreground font-mono">New code</span> above to invalidate the current one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── API key card ─────────────────────────────────────────────── */

function ApiKeyCard() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("kern_api_key");
    if (stored) { setApiKey(stored); setLoading(false); return; }
    fetch("/api/developers/me/apikey-local", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.apiKey) { setApiKey(d.apiKey); sessionStorage.setItem("kern_api_key", d.apiKey); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const masked = apiKey ? `${apiKey.slice(0, 8)}${"•".repeat(24)}${apiKey.slice(-8)}` : null;
  const endpoint = `${window.location.origin}/api`;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Key className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">CLI Setup</h2>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Your API Key</p>
        <p className="text-xs text-muted-foreground">
          Authenticates the <code className="font-mono bg-muted/40 px-1 rounded">kern</code> agent when syncing sessions. Treat it like a password.
        </p>
        {loading ? <Skeleton className="h-9 w-full" /> : apiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted/30 border border-border rounded px-3 py-2 text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {revealed ? apiKey : masked}
              </code>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0" onClick={() => setRevealed(v => !v)}>
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(apiKey); toast({ title: "Copied", description: "API key copied to clipboard." }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-md bg-muted/20 border border-border p-3">
              <p className="text-xs text-muted-foreground font-mono mb-2">Or configure manually in <code className="bg-muted/40 px-1 rounded">~/.kern/config.json</code>:</p>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap select-all">{`{\n  "api_endpoint": "${endpoint}",\n  "api_key": "${revealed ? apiKey : masked}"\n}`}</pre>
            </div>
          </div>
        ) : <p className="text-xs text-muted-foreground italic">API key not available</p>}
      </div>
    </div>
  );
}

/* ─── Integration types ────────────────────────────────────────── */

interface IntegrationStatus {
  type: string;
  connected: boolean;
  config: Record<string, string>;
  connectedAt: string | null;
}

function useIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch("/api/integrations", { credentials: "include" })
      .then(r => r.ok ? r.json() : { integrations: [] })
      .then(d => setIntegrations(d.integrations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { integrations, loading, refetch };
}

/* ─── Slack card ───────────────────────────────────────────────── */

function SlackCard({ status, onRefetch }: { status: IntegrationStatus | undefined; onRefetch: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const connected = status?.connected ?? false;
  const channel = status?.config?.channelName || null;

  const handleConnect = async () => {
    if (!webhookUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ webhookUrl: webhookUrl.trim(), channelName: channelName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Connection failed", description: data.error ?? "Could not connect Slack.", variant: "destructive" });
        return;
      }
      toast({ title: "Slack connected", description: "A test message was sent to your channel." });
      setOpen(false);
      setWebhookUrl("");
      setChannelName("");
      onRefetch();
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/slack", { method: "DELETE", credentials: "include" });
      toast({ title: "Slack disconnected" });
      onRefetch();
    } catch {
      toast({ title: "Error", description: "Could not disconnect.", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card transition-colors" data-testid="integration-card-slack">
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-md border border-border bg-muted/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Slack className="h-5 w-5" style={{ color: "#4A154B" }} />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Slack</div>
            <div className="text-xs text-muted-foreground mt-0.5">Post standups to your team channel automatically</div>
            {connected && channel && (
              <div className="text-xs text-accent mt-1 font-mono">{channel.startsWith("#") ? channel : `#${channel}`}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {connected ? (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-green-400">
                <Check className="h-3 w-3" /> Connected
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive border border-border hover:border-destructive/40"
                onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Unplug className="h-3 w-3 mr-1" />Disconnect</>}
              </Button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                <X className="h-3 w-3" /> Not connected
              </span>
              <Button size="sm" className="h-7 text-xs bg-accent hover:bg-accent/90 text-background font-mono"
                onClick={() => setOpen(v => !v)}>
                <Plug className="h-3 w-3 mr-1" /> Connect
              </Button>
            </>
          )}
        </div>
      </div>

      {open && !connected && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Incoming Webhook URL</label>
            <Input
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              className="text-xs font-mono h-8 bg-background border-border"
              data-testid="input-slack-webhook"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Channel name (optional)</label>
            <Input
              placeholder="#dev-standup"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              className="text-xs font-mono h-8 bg-background border-border"
              data-testid="input-slack-channel"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs bg-accent hover:bg-accent/90 text-background"
              onClick={handleConnect} disabled={saving || !webhookUrl.trim()}
              data-testid="button-save-slack">
              {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Testing…</> : <><Check className="h-3 w-3 mr-1" />Save & Test</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <ExternalLink className="h-3 w-3" /> How to create a webhook
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Generic integration card ─────────────────────────────────── */

interface GenericIntegration {
  type: string;
  name: string;
  description: string;
  icon: React.ElementType;
  iconColor?: string;
  comingSoon?: boolean;
}

const GENERIC_INTEGRATIONS: GenericIntegration[] = [
  { type: "github", name: "GitHub", description: "Git commits captured via kern CLI agent — real-time correlation", icon: Github, comingSoon: false },
  { type: "jira", name: "Jira", description: "Sync work sessions with Jira issues and sprints", icon: SiJira, iconColor: "#0052CC", comingSoon: true },
  { type: "asana", name: "Asana", description: "Link sessions to Asana tasks and projects", icon: SiAsana, iconColor: "#F95C5C", comingSoon: true },
];

function GenericIntegrationCard({ meta, status }: { meta: GenericIntegration; status: IntegrationStatus | undefined }) {
  const Icon = meta.icon;
  const connected = status?.connected ?? false;

  return (
    <div className="flex items-start justify-between p-4 rounded-lg border border-border bg-card hover:border-border/80 transition-colors"
      data-testid={`integration-card-${meta.name.toLowerCase()}`}>
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-md border border-border bg-muted/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="h-5 w-5" style={{ color: meta.iconColor || "currentColor" }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-foreground">{meta.name}</div>
            {meta.comingSoon && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">soon</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{meta.description}</div>
          {connected && status?.connectedAt && (
            <div className="text-xs text-muted-foreground mt-1">
              Since {new Date(status.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {connected ? (
          <span className="inline-flex items-center gap-1 text-xs font-mono text-green-400">
            <Check className="h-3 w-3" /> Connected
          </span>
        ) : meta.comingSoon ? (
          <span className="text-xs font-mono text-muted-foreground px-2 py-1 rounded border border-border">Coming soon</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <X className="h-3 w-3" /> Not connected
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Editable profile card ─────────────────────────────────────── */

const COMMON_TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam",
  "Asia/Kolkata", "Asia/Tokyo", "Asia/Singapore", "Asia/Dubai",
  "Australia/Sydney", "Pacific/Auckland",
];

interface ProfileCardProps {
  me: Developer | undefined;
  isLoading: boolean;
}

function ProfileCard({ me, isLoading }: ProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", githubHandle: "", timezone: "UTC" });

  const startEdit = () => {
    if (!me) return;
    setForm({ name: me.name ?? "", email: me.email ?? "", githubHandle: me.githubHandle ?? "", timezone: me.timezone ?? "UTC" });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/developers/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: form.name, email: form.email, githubHandle: form.githubHandle, timezone: form.timezone }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Update failed", description: data.error ?? "Could not update profile.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profile updated", description: "Your profile has been saved." });
      setEditing(false);
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
        </div>
        {!isLoading && me && !editing && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground border border-border"
            onClick={startEdit}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-xs font-mono h-8 bg-background border-border" placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Email</label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="text-xs font-mono h-8 bg-background border-border" placeholder="you@example.com" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">GitHub handle</label>
              <Input value={form.githubHandle} onChange={e => setForm(f => ({ ...f, githubHandle: e.target.value }))}
                className="text-xs font-mono h-8 bg-background border-border" placeholder="username (no @)" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Timezone</label>
              <select value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                className="w-full h-8 text-xs font-mono bg-background border border-border rounded-md px-2 text-foreground">
                {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs bg-accent hover:bg-accent/90 text-background"
              onClick={handleSave} disabled={saving || !form.name.trim() || !form.email.trim()}>
              {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving…</> : <><Check className="h-3 w-3 mr-1" />Save</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
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
  );
}

/* ─── Main page ────────────────────────────────────────────────── */

export default function Settings() {
  const { data: me, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { integrations, loading: intLoading, refetch } = useIntegrations();

  const getStatus = (type: string) => integrations.find(i => i.type === type);

  return (
    <div className="space-y-8 max-w-2xl" data-testid="page-settings">
      <div>
        <h1 className="text-2xl font-bold font-mono text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Profile, team, and integrations</p>
      </div>

      <ProfileCard me={me} isLoading={isLoading} />

      <InviteCard />

      <ApiKeyCard />

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Integrations</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Connect external tools to automatically sync work sessions and post standups.
        </p>
        {intLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-lg" />)}</div>
        ) : (
          <div className="space-y-2">
            <SlackCard status={getStatus("slack")} onRefetch={refetch} />
            {GENERIC_INTEGRATIONS.map(meta => (
              <GenericIntegrationCard key={meta.type} meta={meta} status={getStatus(meta.type)} />
            ))}
          </div>
        )}
      </div>

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
              <div className="h-5 w-9 rounded-full bg-accent/20 border border-accent/30 cursor-pointer hover:bg-accent/30 transition-colors flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">Terminal Plugin</h2>
        </div>
        <div className="space-y-1">
          {[
            { label: "Shell integration", value: "zsh + fish" },
            { label: "Sync frequency", value: "Every 5 minutes" },
            { label: "Local buffer", value: "30-day SQLite cache" },
            { label: "Auth", value: "Bearer token (API key above)" },
            { label: "Encryption", value: "TLS 1.3 in transit" },
          ].map(item => <InfoRow key={item.label} label={item.label} value={item.value} mono />)}
        </div>
      </div>
    </div>
  );
}
