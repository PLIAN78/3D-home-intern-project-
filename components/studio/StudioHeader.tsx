"use client";

import { ChevronDown, Download, ExternalLink, FileJson, Link2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ProjectBundle } from "@/lib/data/repository";
import type { CustomerConfiguration } from "@/lib/models/project";
import { encodeSelections, useProjectStore, useSelections } from "@/stores/projectStore";
import { useViewerStore } from "@/stores/viewerStore";
import { BrandMark } from "./BrandMark";

export function customerUrl(slug: string, encoded: string) {
  return `${window.location.origin}/projects/${slug}/view?c=${encoded}`;
}

export function buildConfiguration(bundle: ProjectBundle, options: CustomerConfiguration["options"]): CustomerConfiguration {
  return {
    id: `cfg-${Date.now().toString(36)}`,
    projectId: bundle.project.id,
    project: bundle.project.name,
    model: bundle.project.modelName,
    options,
    createdAt: new Date().toISOString(),
  };
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StudioHeader({ bundle }: { bundle: ProjectBundle }) {
  const { project } = bundle;
  const selections = useSelections(project.id);
  const markSaved = useProjectStore((s) => s.markSaved);
  const requestScreenshot = useViewerStore((s) => s.requestScreenshot);

  const save = () => {
    markSaved(project.id);
    toast.success("Configuration saved", { description: "Stored in this browser. Server persistence arrives with the database phase." });
  };
  const copyLink = async () => {
    const url = customerUrl(project.slug, encodeSelections(selections));
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Customer link copied", { description: "Opens the customer view with these selections." });
    } catch {
      toast.message("Customer link", { description: url });
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <BrandMark subtitle="Internal" />
      <span className="h-6 w-px bg-border" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{project.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {project.communityName} · Lot {project.lotNumber} · {project.modelName}
        </div>
      </div>
      <Badge variant="outline" className="hidden md:inline-flex">
        {project.status === "draft" ? "Draft" : project.status === "ready-for-sales" ? "Ready for sales" : "In review"}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Export <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => downloadJson(`${project.slug}-configuration.json`, buildConfiguration(bundle, selections))}>
              <FileJson /> Configuration JSON
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={requestScreenshot}>
              <Download /> Screenshot (PNG)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyLink}>
              <Link2 /> Copy customer link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={save}>
          <Save /> Save
        </Button>
        <Button size="sm" onClick={() => window.open(customerUrl(project.slug, encodeSelections(selections)), "_blank", "noopener")}>
          <ExternalLink /> Customer Preview
        </Button>
      </div>
    </header>
  );
}
