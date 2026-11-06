import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, LogOut } from "@/components/tracker/Icon";
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
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("user_settings").select("ntfy_topic").maybeSingle().then(({ data }) => setTopic(data?.ntfy_topic ?? ""));
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
      .upsert({ user_id: u.user.id, ntfy_topic: t || null, updated_at: new Date().toISOString() });
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
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="my-secret-topic" className="h-12 font-mono text-base" />
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12" onClick={() => save().catch(() => {})}>Save</Button>
            <Button variant="secondary" className="h-12" onClick={sendTest} disabled={busy}>
              <BellRing className="h-4 w-4" /> Send test
            </Button>
          </div>
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
