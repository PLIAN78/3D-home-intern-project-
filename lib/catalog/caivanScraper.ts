import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CatalogCollectionData, CatalogDesignData, CatalogPhotoData, CommunityPageData, PhotoKind, SalesCentreData } from "./types";

/**
 * Reads caivan.com community and collection pages into a property catalogue:
 * collections with prices and specs, each home design with its elevation
 * renderings, floorplan PDF and virtual tour, and the community's photography.
 *
 * Parsing is pure (string in, data out) so it can be tested against saved
 * pages. Images are referenced by their caivan.com URL, not downloaded.
 */

const UPLOADS = /^https:\/\/caivan\.com\/wp-content\/uploads\//;
const NOT_A_PHOTO = /logo|wordmark|-BLK\.png|icon|\.svg$/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", prime: "′" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Visible text of an HTML fragment, whitespace collapsed. */
function text(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag) ?? new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  return m ? decodeEntities(m[1]).trim() : null;
}

function imgSrcs(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => attr(m[0], "src") ?? "").filter((s) => UPLOADS.test(s));
}

/** The element that starts at `start` (an opening tag), up to its matching close tag. */
function element(html: string, start: number): string {
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))?.[1];
  if (!tag) return "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : m[0].endsWith("/>") ? 0 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  return html.slice(start);
}

function elementWith(html: string, marker: RegExp): string | null {
  const m = marker.exec(html);
  if (!m) return null;
  const start = html.lastIndexOf("<", m.index);
  return start >= 0 ? element(html, start) : null;
}

function money(s: string | null | undefined): number | null {
  const m = s && /\$\s*([\d,]+)/.exec(s);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Classify a photo from its file name. */
export function photoKind(url: string): PhotoKind {
  const f = decodeURIComponent(url.split("/").pop() ?? "");
  if (/site[-_]?plan/i.test(f)) return "site-plan";
  if (/key[-_]?map|sales[-_ ]?(centre|center|gallery)/i.test(f)) return "sales-centre";
  if (/aerial|drone/i.test(f)) return "aerial";
  if (/kitchen|living|great[-_]?room|bedroom|ensuite|breakfast|dining|bath|interior|loft|den\b/i.test(f)) return "interior";
  if (/^(OASD|OP|OATH|OAFH|OAT|TBSD|TATH)[\dA-Z_-]/i.test(f) || /elevation/i.test(f)) return "elevation";
  if (/streetscape|exterior|backyard|street|facade|home[s]?[-_]/i.test(f)) return "exterior";
  return "lifestyle";
}

// ---------------------------------------------------------------------------
// Community page
// ---------------------------------------------------------------------------

function parseCollectionCards(html: string): CatalogCollectionData[] {
  const homes = elementWith(html, /\sid="homes"/);
  if (!homes) return [];
  const out: CatalogCollectionData[] = [];
  for (const m of homes.matchAll(/<div\b[^>]*class="[^"]*\bcollection-link\b[^"]*"[^>]*>/gi)) {
    const card = element(homes, m.index!);
    const name = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(card);
    if (!name) continue;
    const href = /<a\b[^>]*href="([^"]+)"/i.exec(card)?.[1] ?? null;
    const body = /<div class="font-body">([\s\S]*?)<\/div>/i.exec(card)?.[1] ?? "";
    const lines = text(body).split("\n").flatMap((l) => l.split("|")).map((l) => l.trim()).filter(Boolean);
    const pick = (re: RegExp) => lines.find((l) => re.test(l)) ?? null;
    out.push({
      name: text(name[1]),
      pageUrl: href && /^https:\/\/caivan\.com\//.test(href) ? href : null,
      priceFrom: money([...card.matchAll(/<div class="font-label[^"]*">([\s\S]*?)<\/div>/gi)].map((l) => text(l[1])).find((l) => /from\s*\$/i.test(l) && !/mth|month/i.test(l))),
      sqft: pick(/sq\.?\s*ft/i),
      bedrooms: pick(/bedroom/i),
      bathrooms: pick(/bathroom/i),
      parking: pick(/parking|garage/i),
      imageUrl: imgSrcs(card)[0] ?? null,
      designs: [],
    });
  }
  return out;
}

function parseSalesCentre(html: string): SalesCentreData | null {
  const block = elementWith(html, /\sid="sales"/);
  if (!block) return null;
  const content = /<div class="grid-4 cb-content">([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? "";
  const name = text(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(content)?.[1] ?? "") || null;
  const firstP = text((/<p>([\s\S]*?)<\/p>/i.exec(content)?.[1] ?? "").replace(/<a\b[\s\S]*$/i, ""));
  const lines = firstP.split("\n").map((l) => l.trim()).filter(Boolean);
  const phone = lines.find((l) => /^\+?[\d\s().-]{10,}$/.test(l)) ?? null;
  const address = lines.filter((l) => l !== phone && !/protected|@/.test(l)).join(", ") || null;
  const mapUrl = [...block.matchAll(/href="(https:\/\/(?:maps\.app\.goo\.gl|www\.google\.[a-z.]+\/maps|goo\.gl\/maps)[^"]*)"/gi)][0]?.[1] ?? null;
  return { name, address, phone, mapUrl: mapUrl ? decodeEntities(mapUrl) : null, imageUrl: imgSrcs(block)[0] ?? null };
}

/** Amenity popups: a heading, a sentence and a photo. */
function parseAmenities(html: string, pageUrl: string): CatalogPhotoData[] {
  const out: CatalogPhotoData[] = [];
  for (const m of html.matchAll(/<aside\b[^>]*id="community-popup-\d+"[^>]*>/gi)) {
    const popup = element(html, m.index!);
    const title = text(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(popup)?.[1] ?? "");
    const desc = text(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(popup)?.[1] ?? "");
    const url = imgSrcs(popup).find((u) => !NOT_A_PHOTO.test(u));
    if (url && title) out.push({ url, kind: "amenity", caption: desc ? `${title}: ${desc}` : title, sourceUrl: pageUrl });
  }
  return out;
}

export function parseCommunityPage(html: string, pageUrl: string, id: string): CommunityPageData {
  const hero = elementWith(html, /class="community-image"/);
  const notif = elementWith(html, /\sid="notif-desc"/);
  const heroUrl = hero ? (imgSrcs(hero)[0] ?? null) : null;
  const collections = parseCollectionCards(html);
  const salesCentre = parseSalesCentre(html);

  const photos: CatalogPhotoData[] = [];
  const seen = new Set<string>();
  const add = (p: CatalogPhotoData) => {
    if (seen.has(p.url) || NOT_A_PHOTO.test(p.url)) return;
    seen.add(p.url);
    photos.push(p);
  };
  if (heroUrl) add({ url: heroUrl, kind: "hero", caption: null, sourceUrl: pageUrl });
  for (const c of collections) if (c.imageUrl) add({ url: c.imageUrl, kind: photoKind(c.imageUrl) === "interior" ? "interior" : "exterior", caption: c.name, collection: c.name, linkUrl: c.pageUrl, sourceUrl: pageUrl });
  const amenities = parseAmenities(html, pageUrl);
  const amenityUrls = new Set(amenities.map((a) => a.url));
  // Plain gallery photography first; amenity photos keep their captions.
  for (const url of imgSrcs(html)) if (!amenityUrls.has(url) && url !== salesCentre?.imageUrl) add({ url, kind: photoKind(url), caption: null, sourceUrl: pageUrl });
  for (const a of amenities) add(a);
  if (salesCentre?.imageUrl) add({ url: salesCentre.imageUrl, kind: "sales-centre", caption: salesCentre.name, linkUrl: salesCentre.mapUrl, sourceUrl: pageUrl });

  return {
    id,
    pageUrl,
    description: notif ? text(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(notif)?.[1] ?? "") || null : null,
    heroUrl,
    logoUrl: notif ? (imgSrcs(notif)[0] ?? null) : null,
    salesCentre,
    collections,
    photos,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Collection page: one <section class="plan"> per home design
// ---------------------------------------------------------------------------

export function parseCollectionPage(html: string, pageUrl: string): { collection: string | null; designs: CatalogDesignData[] } {
  const designs: CatalogDesignData[] = [];
  let collection: string | null = null;
  const starts = [...html.matchAll(/<section class="plan\b[^"]*"[^>]*>/gi)].map((m) => m.index!);
  for (let i = 0; i < starts.length; i++) {
    const end = starts[i + 1] ?? html.indexOf("</main>", starts[i]);
    const section = html.slice(starts[i], end > 0 ? end : undefined);
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(section);
    if (!h3) continue;
    const heading = text(h3[1]);
    const slash = heading.lastIndexOf(" / ");
    collection ??= slash > 0 ? heading.slice(0, slash).trim() : null;
    let name = (slash > 0 ? heading.slice(slash + 3) : heading).trim();
    const modelHome = /-\s*model home/i.test(name);
    const soldOut = /sold out/i.test(name);
    name = name.replace(/\s*-\s*model home\s*$/i, "").replace(/\s*(currently\s+)?sold out\s*$/i, "").trim();

    const elevations: CatalogDesignData["elevations"] = [];
    for (const f of section.matchAll(/<figure\b[^>]*collection-item[^>]*>([\s\S]*?)<\/figure>\s*(?:<\/div>\s*)*<div class="font-label no-margin">([\s\S]*?)<\/div>/gi)) {
      const url = imgSrcs(f[1])[0];
      const label = text(f[2]);
      if (url && !/virtual tour/i.test(label) && !elevations.some((e) => e.url === url)) elevations.push({ label: label.replace(/^elevation\b/i, "Elevation"), url });
    }

    const stats: Record<string, string> = {};
    for (const r of section.matchAll(/<div class="x stat-row[^"]*">\s*<div>([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>/gi)) stats[text(r[1]).toLowerCase()] = text(r[2]);
    const note = /<small>\s*\*?([\s\S]*?)<\/small>/i.exec(section);
    const link = (label: RegExp) => [...section.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].find((a) => label.test(text(a[2])))?.[1] ?? null;
    const tour = /data-src="(https:\/\/[^"]*(?:youriguide|matterport|360)[^"]*)"/i.exec(section)?.[1] ?? null;
    const tourBlock = tour ? elementWith(section, /<section class="virtual-tour/) : null;

    designs.push({
      name,
      modelHome,
      soldOut,
      // "2,379*" or a range "1,762 - 1,808": keep the smallest figure.
      sqft: Number(/[\d,]{3,}/.exec(stats["square feet"] ?? "")?.[0].replace(/,/g, "")) || null,
      sqftNote: note ? text(note[1]) : null,
      bedrooms: stats["bedrooms"] ?? null,
      bathrooms: stats["bathrooms"] ?? null,
      parking: stats["parking"] ?? null,
      floorplanPdf: link(/floor\s*plan/i),
      featureSheetPdf: link(/feature sheet/i),
      brochurePdf: link(/brochure/i),
      virtualTourUrl: tour,
      tourImageUrl: tourBlock ? (imgSrcs(tourBlock).find((u) => !NOT_A_PHOTO.test(u)) ?? null) : null,
      elevations,
      pageUrl,
    });
  }
  return { collection, designs };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-CA,en;q=0.9",
};

const run = promisify(execFile);

/**
 * caivan.com sits behind Cloudflare, which challenges Node's fetch but lets
 * curl through, so a 403 falls back to the system curl (bundled with Windows
 * 10+, macOS and most Linux distributions).
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS }).catch(() => null);
  if (res?.ok) return res.text();
  const args = ["-sL", "--max-time", "45", "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(HEADERS)) args.push(k === "User-Agent" ? "-A" : "-H", k === "User-Agent" ? v : `${k}: ${v}`);
  const { stdout } = await run("curl", [...args, url], { maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  const status = Number(stdout.slice(stdout.lastIndexOf("\n") + 1));
  if (status !== 200) throw new Error(`${url} returned HTTP ${status || res?.status}`);
  return stdout.slice(0, stdout.lastIndexOf("\n"));
}

/** Scrape one community page and all of its collection pages. */
export async function scrapeCommunity(id: string, pageUrl: string, log: (msg: string) => void = () => {}): Promise<CommunityPageData> {
  const page = parseCommunityPage(await fetchHtml(pageUrl), pageUrl, id);
  for (const c of page.collections) {
    if (!c.pageUrl) continue;
    try {
      const { designs } = parseCollectionPage(await fetchHtml(c.pageUrl), c.pageUrl);
      c.designs = designs;
      for (const d of designs)
        for (const e of d.elevations)
          if (!page.photos.some((p) => p.url === e.url && p.design === d.name && p.collection === c.name)) page.photos.push({ url: e.url, kind: /elevation/i.test(e.label) ? "elevation" : "interior", caption: `${d.name} · ${e.label}`, collection: c.name, design: d.name, sourceUrl: c.pageUrl });
      for (const d of designs)
        if (d.tourImageUrl && !page.photos.some((p) => p.url === d.tourImageUrl && p.design === d.name && p.collection === c.name))
          page.photos.push({ url: d.tourImageUrl, kind: "virtual-tour", caption: `${d.name} model home · 360° tour`, collection: c.name, design: d.name, linkUrl: d.virtualTourUrl, sourceUrl: c.pageUrl });
      log(`  ${c.name}: ${designs.length} designs`);
    } catch (err) {
      log(`  ${c.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return page;
}
