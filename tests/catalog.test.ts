import { describe, expect, it } from "vitest";
import { decodeEntities, parseCollectionPage, parseCommunityPage, photoKind } from "@/lib/catalog/caivanScraper";
import { collectionKey } from "@/lib/catalog/match";

const U = "https://caivan.com/wp-content/uploads/2024/05";

// Trimmed from caivan.com's markup (Oct 2026).
const COMMUNITY = `
<main><div class="community-image"><figure class="responsive-image"><img src="${U}/hero-kitchen-web.jpg" alt="The Conservancy" /></figure></div>
<div id="notif-desc" class="psr"><div><img class="black-img" src="${U}/Conservancy-Logo.png" alt=""></div><div><p class="tiny-mw font-body">Set along the historic Jock River &amp; Barrhaven.</p></div></div>
<div id="homes" class="container"><div class="collection-items">
  <div sm="c6 px0" class="collection-link sec-margin-bottom px1 c6 "><a href="https://caivan.com/ottawa/the-conservancy/35-collection/" class="img-hover-effect"><figure class="responsive-image mb1-5"><img src="${U}/OP3516_D-640x452.jpg" loading="lazy" alt=""></figure></a><div class="font-label micro-margin">Starting from $702,646</div><h3 class="font-display-3 micro-margin">35&#8242; collection</h3><div class="font-body">2,159 - 2,928 SQ. FT.<br /> 3 - 6 Bedrooms | 2.5 - 5.5 Bathrooms<br /> Up to 4 Car Parking</div></div>
  <div sm="c6 px0" class="collection-link sec-margin-bottom px1 c6 "><a href="https://caivan.com/ottawa/the-conservancy/the-summit-series/" class="img-hover-effect"><figure class="responsive-image mb1-5"><img src="${U}/Kitchen_Living_03-WEB.jpg" loading="lazy" alt=""></figure></a><div class="font-label micro-margin">Own it from $1,330/mth</div><h3 class="font-display-3 micro-margin">The Summit Series</h3><div class="font-body">Up to 3 Bedrooms | Up to 2 Bathrooms</div></div>
</div></div>
<img src="${U}/Barrhaven-Drone-12-web.jpg" alt="">
<aside sm="dn" id="community-popup-2" class="virtual-popup popup"><div><h4 class="font-display-4">Mobility &amp; Transit</h4><p class="font-body">Rapid transit nearby.</p></div><div><figure><img loading="lazy" src="${U}/lrt3.webp"></figure></div></aside>
<div id="sales" class="contact-block"><div class="grid-8"><a href="https://maps.app.goo.gl/abc" target="_blank"><img src="${U}/KeyMap_1033-Canoe-Street.jpg" alt="Sales Gallery"></a></div><div class="grid-4 cb-content"><h4 class="font-display-4">Sales Gallery &#038; Model Homes</h4><p>1033 Canoe Street<br /> Nepean, ON K2J 7M6<br>613-518-2364<br><a href="/cdn-cgi/l/email-protection#30">[email&#160;protected]</a></p></div></div>
</main>`;

const COLLECTION = `
<section class="plan main-mw px2 mxa active"><h3 class="font-display-2">35&#8242; collection / The Hemlock - Model Home</h3>
  <div><figure class="mb0-5 responsive-image collection-item"><img loading="lazy" src="${U}/OASD3516_D-web.jpg" alt=""></figure></div><div class="font-label no-margin">Elevation D</div>
  <div><figure class="mb0-5 responsive-image collection-item"><img loading="lazy" src="${U}/OASD3516_A-web.jpg" alt=""></figure></div><div class="font-label no-margin">ELEVATION A</div>
  <section class="virtual-tour c12" id="inner-virtual"><aside><iframe data-src="https://youriguide.com/1033_canoe_st_ottawa_on/" class="lazyload"></iframe></aside><figure class="responsive-image c12"><img src="${U}/25093-256.jpg" alt="" /><img src="https://caivan.com/wp-content/themes/caivan-theme/assets/images/360.svg" alt="" /></figure></section>
  <div><a target="_blank" download="" href="${U}/Caivan-35-The-Hemlock.pdf" class="btn">Download Floorplan</a></div>
  <div class="x stat-row xw xjb"><div>Square Feet</div><div>2,379*</div></div><div class="x stat-row xw xjb"><div>Bedrooms</div><div>3 (Optional up to 5)</div></div>
  <div class="x stat-row xw xjb"><div>Bathrooms</div><div>2.5 (Optional up to 3.5)</div></div><div class="x stat-row xw xjb"><div>Parking</div><div>2</div></div>
  <div class="x stat-row xw xjb"><div><small>*Square Feet includes 551 Sq. Ft. Finished Basement</small></div></div>
  <a href="${U}/Feature_Sheet.pdf" class="btn">Download Feature Sheets</a><a href="${U}/Brochure-web.pdf" class="btn">Download Brochure</a>
</section>
<section class="plan main-mw px2 mxa "><h3 class="font-display-2">40&#8242; Collection / Plan 20 Corner Currently SOLD OUT</h3>
  <div class="x stat-row xw xjb"><div>Square Feet</div><div>1,762 - 1,808</div></div>
</section>
</main>`;

describe("caivan.com community page", () => {
  const page = parseCommunityPage(COMMUNITY, "https://caivan.com/ottawa/the-conservancy/", "the-conservancy");

  it("reads the hero, logo and description", () => {
    expect(page.heroUrl).toBe(`${U}/hero-kitchen-web.jpg`);
    expect(page.logoUrl).toBe(`${U}/Conservancy-Logo.png`);
    expect(page.description).toBe("Set along the historic Jock River & Barrhaven.");
  });

  it("reads each collection's price and specs, ignoring monthly payments", () => {
    expect(page.collections.map((c) => c.name)).toEqual(["35′ collection", "The Summit Series"]);
    const [c35, summit] = page.collections;
    expect(c35).toMatchObject({ priceFrom: 702646, sqft: "2,159 - 2,928 SQ. FT.", bedrooms: "3 - 6 Bedrooms", bathrooms: "2.5 - 5.5 Bathrooms", parking: "Up to 4 Car Parking", pageUrl: "https://caivan.com/ottawa/the-conservancy/35-collection/" });
    expect(summit.priceFrom).toBeNull();
  });

  it("classifies photos and keeps amenity captions, without logos", () => {
    const byUrl = Object.fromEntries(page.photos.map((p) => [p.url.split("/").pop(), p]));
    expect(byUrl["hero-kitchen-web.jpg"].kind).toBe("hero");
    expect(byUrl["Barrhaven-Drone-12-web.jpg"].kind).toBe("aerial");
    expect(byUrl["lrt3.webp"]).toMatchObject({ kind: "amenity", caption: "Mobility & Transit: Rapid transit nearby." });
    expect(byUrl["KeyMap_1033-Canoe-Street.jpg"]).toMatchObject({ kind: "sales-centre", linkUrl: "https://maps.app.goo.gl/abc" });
    expect(byUrl["Conservancy-Logo.png"]).toBeUndefined();
    expect(new Set(page.photos.map((p) => p.url)).size).toBe(page.photos.length);
  });

  it("reads the sales centre", () => {
    expect(page.salesCentre).toEqual({ name: "Sales Gallery & Model Homes", address: "1033 Canoe Street, Nepean, ON K2J 7M6", phone: "613-518-2364", mapUrl: "https://maps.app.goo.gl/abc", imageUrl: `${U}/KeyMap_1033-Canoe-Street.jpg` });
  });
});

describe("caivan.com collection page", () => {
  const { collection, designs } = parseCollectionPage(COLLECTION, "https://caivan.com/ottawa/the-conservancy/35-collection/");

  it("reads each design with its elevations, specs and documents", () => {
    expect(collection).toBe("35′ collection");
    expect(designs[0]).toMatchObject({
      name: "The Hemlock",
      modelHome: true,
      soldOut: false,
      sqft: 2379,
      sqftNote: "Square Feet includes 551 Sq. Ft. Finished Basement",
      bedrooms: "3 (Optional up to 5)",
      parking: "2",
      floorplanPdf: `${U}/Caivan-35-The-Hemlock.pdf`,
      featureSheetPdf: `${U}/Feature_Sheet.pdf`,
      brochurePdf: `${U}/Brochure-web.pdf`,
      virtualTourUrl: "https://youriguide.com/1033_canoe_st_ottawa_on/",
      tourImageUrl: `${U}/25093-256.jpg`,
    });
    expect(designs[0].elevations).toEqual([
      { label: "Elevation D", url: `${U}/OASD3516_D-web.jpg` },
      { label: "Elevation A", url: `${U}/OASD3516_A-web.jpg` },
    ]);
  });

  it("cleans sold-out names and size ranges", () => {
    expect(designs[1]).toMatchObject({ name: "Plan 20 Corner", soldOut: true, modelHome: false, sqft: 1762, elevations: [] });
  });
});

describe("catalogue helpers", () => {
  it("matches site-plan collection names to published ones", () => {
    expect(collectionKey("35′ Collection")).toBe(collectionKey("35′ collection"));
    expect(collectionKey("35' Collection")).toBe(collectionKey("35’  Collection"));
  });
  it("decodes entities and classifies by file name", () => {
    expect(decodeEntities("41&#8242; &amp; Caf&eacute;s &#x2019;")).toBe("41′ & Caf&eacute;s ’");
    expect(photoKind(`${U}/Streetscape_Day-web.jpg`)).toBe("exterior");
    expect(photoKind(`${U}/ADHOC-LIONS-C8-Primary-Bedroom-Singles.jpg`)).toBe("interior");
    expect(photoKind(`${U}/20260929-The-Conservancy-Site-Plan.jpg`)).toBe("site-plan");
  });
});
