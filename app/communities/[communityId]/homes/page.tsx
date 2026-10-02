import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Map as MapIcon, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HomeDesignCard } from "@/components/catalog/HomeDesignCard";
import { PhotoGallery } from "@/components/catalog/PhotoGallery";
import { RefreshPhotosButton } from "@/components/catalog/RefreshPhotosButton";
import { RemotePhoto } from "@/components/catalog/RemotePhoto";
import { AppHeader } from "@/components/studio/AppHeader";
import { getCatalogCommunity, getCommunity } from "@/lib/data/repository";

export async function generateMetadata({ params }: PageProps<"/communities/[communityId]/homes">): Promise<Metadata> {
  const { communityId } = await params;
  const c = await getCatalogCommunity(communityId);
  return { title: c ? `${c.name} homes & photos · Home Studio` : "Community not found" };
}

const price = (n: number) => `$${n.toLocaleString("en-CA")}`;

export default async function CommunityHomesPage({ params }: PageProps<"/communities/[communityId]/homes">) {
  const { communityId } = await params;
  const [c, placed] = await Promise.all([getCatalogCommunity(communityId), getCommunity(communityId)]);
  if (!c) notFound();
  const gallery = c.photos.filter((p) => p.kind !== "hero");
  const sales = c.salesCentre;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 to-background">
      <AppHeader active="/communities" />
      <section className="relative">
        {c.heroUrl ? <RemotePhoto src={c.heroUrl} alt={c.name} eager className="h-[300px] w-full sm:h-[380px]" /> : <div className="h-[200px] bg-gradient-to-br from-sky-200 to-emerald-100" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-6 text-white">
          <Button asChild variant="secondary" size="sm" className="mb-3 opacity-90">
            <Link href="/communities">
              <ArrowLeft /> Communities
            </Link>
          </Button>
          <div className="text-xs font-medium tracking-wide uppercase opacity-80">
            {c.city === c.region ? c.city : `${c.city} · ${c.region}`}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          <p className="mt-1 max-w-2xl text-sm opacity-90">{c.description ?? c.blurb}</p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        <div className="flex flex-wrap items-center gap-2">
          {placed?.geo ? (
            <Button asChild size="sm">
              <Link href={`/communities/${c.id}`}>
                <MapIcon /> Open 3D community map
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/communities">
                <MapIcon /> {c.sitePlanPdf ? "Place on the real map from Communities" : "Upload a site plan from Communities"}
              </Link>
            </Button>
          )}
          {c.sitePlanPdf && (
            <Button asChild size="sm" variant="outline">
              <a href={c.sitePlanPdf} target="_blank" rel="noreferrer">
                Site plan PDF <ExternalLink />
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <a href={c.pageUrl} target="_blank" rel="noreferrer">
              caivan.com <ExternalLink />
            </a>
          </Button>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {c.scrapedAt && <span>Photos checked {new Date(c.scrapedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>}
            <RefreshPhotosButton communityId={c.id} />
          </div>
        </div>

        {c.collections.length > 0 ? (
          c.collections.map((col) => (
            <section key={col.id} id={`collection-${col.id.split("/").pop()}`} className="scroll-mt-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{col.name}</h2>
                  <p className="text-xs text-muted-foreground">{[col.sqft, col.bedrooms, col.bathrooms, col.parking].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {col.priceFrom && <Badge variant="outline">From {price(col.priceFrom)}</Badge>}
                  {col.pageUrl && (
                    <Button asChild size="xs" variant="ghost">
                      <a href={col.pageUrl} target="_blank" rel="noreferrer">
                        Collection page <ExternalLink />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              {col.designs.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {col.designs.map((d) => (
                    <HomeDesignCard key={d.id} design={d} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">No individual home designs are published for this collection yet.</p>
              )}
            </section>
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">caivan.com hasn&apos;t published home designs for {c.name} yet. Photos appear here as soon as they do; use Refresh photos to check.</p>
        )}

        {gallery.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Community photos</h2>
            <PhotoGallery photos={gallery} sourceUrl={c.pageUrl} />
          </section>
        )}

        {sales && (
          <section className="grid overflow-hidden rounded-xl border bg-background sm:grid-cols-[2fr_1fr]">
            {sales.imageUrl && <RemotePhoto src={sales.imageUrl} alt={sales.name ?? "Sales centre"} className="aspect-[16/9] sm:aspect-auto sm:min-h-56" />}
            <div className="space-y-2 p-5 text-sm">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Visit</div>
              <div className="font-semibold">{sales.name}</div>
              {sales.address && <p className="text-muted-foreground">{sales.address}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {sales.mapUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={sales.mapUrl} target="_blank" rel="noreferrer">
                      <MapPin /> Directions
                    </a>
                  </Button>
                )}
                {sales.phone && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`tel:${sales.phone.replace(/[^\d+]/g, "")}`}>
                      <Phone /> {sales.phone}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
