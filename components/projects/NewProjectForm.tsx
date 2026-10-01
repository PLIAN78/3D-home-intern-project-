"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProjectAction, type CreateProjectState } from "@/app/projects/actions";
import { cn } from "@/lib/utils";

interface CommunityOption {
  id: string;
  name: string;
  lots: { id: string; number: string; takenBy?: string; status?: string }[];
}

export function NewProjectForm({ communities, initialCommunityId, initialLotId }: { communities: CommunityOption[]; initialCommunityId?: string; initialLotId?: string }) {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProjectAction, {});
  const [communityId, setCommunityId] = useState(state.fields?.communityId ?? (communities.some((c) => c.id === initialCommunityId) ? initialCommunityId! : (communities[0]?.id ?? "")));
  const community = communities.find((c) => c.id === communityId);
  const firstFree = community?.lots.find((l) => !l.takenBy)?.id ?? "";
  const [lotId, setLotId] = useState(state.fields?.lotId ?? (community?.lots.some((l) => l.id === initialLotId && !l.takenBy) ? initialLotId! : firstFree));
  const [template, setTemplate] = useState<"blank" | "plan-36">(state.fields?.template === "plan-36" ? "plan-36" : "blank");
  const [floors, setFloors] = useState(state.fields?.floorCount ?? "3");

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" name="name" required placeholder="Bradley Ridge Lot 44" defaultValue={state.fields?.name} />
        </div>
        <div className="space-y-1.5">
          <Label>Community</Label>
          <Select
            name="communityId"
            value={communityId}
            onValueChange={(v) => {
              setCommunityId(v);
              setLotId(communities.find((c) => c.id === v)?.lots.find((l) => !l.takenBy)?.id ?? "");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {communities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Lot number</Label>
          <Select name="lotId" value={lotId} onValueChange={setLotId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a lot" />
            </SelectTrigger>
            <SelectContent>
              {community?.lots.map((l) => (
                <SelectItem key={l.id} value={l.id} disabled={!!l.takenBy}>
                  Lot {l.number}
                  {l.takenBy ? ` — ${l.takenBy}` : l.status === "available" ? " — available" : l.status === "future" ? " — future release" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modelName">Model / home name</Label>
          <Input id="modelName" name="modelName" required placeholder="Plan 36" defaultValue={state.fields?.modelName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="floorCount">Number of floors</Label>
          <Input id="floorCount" name="floorCount" type="number" min={1} max={5} value={floors} onChange={(e) => setFloors(e.target.value)} disabled={template === "plan-36"} />
          {template === "plan-36" && <input type="hidden" name="floorCount" value="3" />}
        </div>
      </div>

      <label className={cn("flex items-center gap-2 text-sm", template === "plan-36" && "opacity-50")}>
        <Checkbox name="hasBasement" defaultChecked disabled={template === "plan-36"} /> Includes a basement (counted in the number of floors)
      </label>

      <div className="space-y-1.5">
        <Label>Starting geometry</Label>
        <input type="hidden" name="template" value={template} />
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "blank", title: "Blank — trace from drawings", body: "Empty floors. Upload plans, then trace or auto-extract." },
              { id: "plan-36", title: "Copy the Plan 36 sample", body: "Pre-built 3-level demo home you can edit." },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTemplate(o.id)}
              className={cn("rounded-lg border p-3 text-left transition-colors", template === o.id ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "hover:bg-muted/50")}
            >
              <div className="text-sm font-medium">{o.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{o.body}</div>
            </button>
          ))}
        </div>
      </div>

      {state.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !lotId}>
          {pending && <Loader2 className="animate-spin" />} Create project
        </Button>
      </div>
    </form>
  );
}
