"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Re-reads the community's homes and photos from caivan.com. */
export function RefreshPhotosButton({ communityId, size = "sm", variant = "ghost" }: { communityId: string; size?: "sm" | "xs"; variant?: "ghost" | "outline" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/catalog/${communityId}/sync`, { method: "POST" });
          const data = (await res.json()) as { error?: string; photos?: number; designs?: number };
          if (!res.ok) throw new Error(data.error ?? "Couldn't reach caivan.com");
          toast.success("Photos updated", { description: `${data.designs} home designs, ${data.photos} photos from caivan.com.` });
          router.refresh();
        } catch (err) {
          toast.error("Couldn't refresh photos", { description: err instanceof Error ? err.message : undefined });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh photos
    </Button>
  );
}
