"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A photo hot-linked from the builder's site. Plain <img> on purpose: the
 * Next.js image optimiser would fetch server-side, which caivan.com's
 * Cloudflare protection rejects. No referrer is sent, and a broken link shows a
 * neutral placeholder instead of the browser's broken-image icon.
 */
export function RemotePhoto({ src, alt, className, imgClassName, eager }: { src: string; alt: string; className?: string; imgClassName?: string; eager?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {failed === src ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <ImageOff className="size-4" /> Photo unavailable
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote photo, see above
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className={cn("absolute inset-0 size-full object-cover", imgClassName)}
        />
      )}
    </div>
  );
}
