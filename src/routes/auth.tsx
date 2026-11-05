import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — ViewPulse" },
      { name: "description", content: "Sign in to track your TikTok post views privately." },
      { property: "og:title", content: "Sign in — ViewPulse" },
      { property: "og:description", content: "Sign in to track your TikTok post views privately." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Activity className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold">ViewPulse</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        {mode === "in" ? "Sign in to see your tracked posts." : "Create an account to start tracking."}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input className="h-12 text-base" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input className="h-12 text-base" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <button
        className="mt-5 py-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in" ? "No account? Sign up" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
