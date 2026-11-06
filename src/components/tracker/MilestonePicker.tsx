import { useState } from "react";
import { X, Plus } from "@/components/tracker/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QUICK_MILESTONES, compact, parseViews } from "@/lib/format";
import { toast } from "sonner";

export function MilestonePicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [custom, setCustom] = useState("");
  const all = [...new Set([...QUICK_MILESTONES, ...value])].sort((a, b) => a - b);
  const toggle = (n: number) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const addCustom = () => {
    const v = parseViews(custom);
    if (!v) {
      toast.error("Try something like 250K or 2M");
      return;
    }
    if (!value.includes(v)) onChange([...value, v]);
    setCustom("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {all.map((n) => {
          const on = value.includes(n);
          return (
            <Button variant="secondary"
              type="button"
              key={n}
              onClick={() => toggle(n)}
              className={`flex h-11 items-center gap-1 rounded-full border px-4 font-display text-[13px] font-semibold transition ${
                on ? "silver-chip" : "dark-button hover:brightness-110"
              }`}
            >
              {compact(n)}
              {on && !QUICK_MILESTONES.includes(n) && <X className="h-3.5 w-3.5" />}
            </Button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Custom, e.g. 250K"
          className="h-11 text-base"
        />
        <Button type="button" variant="secondary" className="h-11 px-4" onClick={addCustom}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
