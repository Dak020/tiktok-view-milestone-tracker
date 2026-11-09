import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, LogOut, Eye } from "@/components/tracker/Icon";
import { AppHeader } from "@/components/tracker/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { sendTestNotification } from "@/lib/tracker.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settings — ViewPulse" },
      { name: "description", content: "Set your ntfy topic for milestone push alerts." },
      { property: "og:title", content: "Settings — ViewPulse" },
      { property: "og:description", content: "Set your ntfy topic for milestone push alerts." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const test = useServerFn(sendTestNotification);
  const [topic, setTopic] = useState("");
  const [showTopic, setShowTopic] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("user_settings").select("ntfy_topic, rapidapi_key").maybeSingle().then(({ data }) => {
      setTopic(data?.ntfy_topic ?? "");
      setApiKey(data?.rapidapi_key ?? "");
    });
  }, []);

  async function save() {
    const t = topic.trim();
    if (t && !/^[A-Za-z0-9_-]{1,64}$/.test(t)) {
      toast.error("Use letters, numbers, - or _ only");
      throw new Error("Invalid topic");
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: u.user.id, ntfy_topic: t || null, rapidapi_key: apiKey.trim().replace(/\.+$/, "") || null, updated_at: new Date().toISOString() });
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Saved");
  }

  async function sendTest() {
    setBusy(true);
    try {
      await save();
      await test();
      toast.success("Test sent — check your phone");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <AppHeader back title="Settings" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="space-y-3 surface-card">
          <h2 className="font-bold">Push alerts (ntfy)</h2>
          <p className="text-sm text-muted-foreground">
            Install the ntfy app, subscribe to a topic name only you know, and enter that same name here.
          </p>
          <div className="relative">
            <Input
              type={showTopic ? "text" : "password"}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="my-secret-topic"
              className="h-12 font-mono text-base pr-12 tracking-wider"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowTopic((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={showTopic ? "Hide topic" : "Show topic"}
            >
              {showTopic ? (
                <svg className="h-4 w-4" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 19c-7 0-11-7-11-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 5c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12" onClick={() => save().catch(() => {})}>Save</Button>
            <Button variant="secondary" className="h-12" onClick={sendTest} disabled={busy}>
              <BellRing className="h-4 w-4" /> Send test
            </Button>
          </div>
        </section>
        <section className="space-y-3 surface-card">
          <h2 className="font-bold">TikTok scraper key (optional)</h2>
          <p className="text-sm text-muted-foreground">
            Paste your own RapidAPI key for "Tiktok Scraper" by TIKWM for more reliable checks. Only you can see it. Without a key, the free public checker is used.
          </p>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your RapidAPI key"
              className="h-12 font-mono text-base pr-12"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>
          <Button className="h-12 w-full" onClick={() => save().catch(() => {})}>Save key</Button>
        </section>
        <section className="flex items-center justify-between surface-card">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="truncate font-medium">{email}</p>
          </div>
          <Button
            variant="secondary"
            className="h-11"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </section>
      </main>
    </div>
  );
}
