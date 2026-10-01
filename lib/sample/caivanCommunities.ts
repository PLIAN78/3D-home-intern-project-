/**
 * Caivan communities as listed on caivan.com (public pages, Oct 2026).
 * Site-plan PDFs are the published lotting plans used to place lots on the
 * real map. Communities without a published site plan can be imported by
 * uploading one.
 */

export interface CatalogCommunity {
  id: string;
  name: string;
  region: "Ottawa" | "Greater Toronto Area";
  city: string;
  url: string;
  sitePlanPdf: string | null;
  collections: string[];
  blurb: string;
}

export const CAIVAN_COMMUNITIES: CatalogCommunity[] = [
  {
    id: "the-conservancy",
    name: "The Conservancy",
    region: "Ottawa",
    city: "Ottawa",
    url: "https://caivan.com/ottawa/the-conservancy/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2022/02/20260929-The-Conservancy-Site-Plan.pdf",
    collections: ["The Summit Series", "The Perfect Townhome", "35′ Collection", "41′ Collection", "42′ Collection", "50′ Collection"],
    blurb: "Master-planned community along the Jock River in Barrhaven, with 140 acres of green space.",
  },
  {
    id: "magnolia",
    name: "Magnolia",
    region: "Ottawa",
    city: "Ottawa",
    url: "https://caivan.com/ottawa/magnolia/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2026/04/Magnolia-Site-Plan-260929.pdf",
    collections: ["The Summit Series", "The Perfect Townhome", "35′ Collection", "41′ Collection", "42′ Collection", "50′ Collection"],
    blurb: "Stittsville's new master-planned community of towns and single-detached homes.",
  },
  {
    id: "fox-run",
    name: "Fox Run",
    region: "Ottawa",
    city: "Richmond, Ottawa",
    url: "https://caivan.com/ottawa/fox-run/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2022/02/20260929-Fox-Run-Site-Plan.pdf",
    collections: ["The Perfect Townhome", "Series I", "Series II", "Series III"],
    blurb: "Small-town charm in the historic village of Richmond.",
  },
  {
    id: "orleans-village",
    name: "Orléans Village",
    region: "Ottawa",
    city: "Orléans, Ottawa",
    url: "https://caivan.com/ottawa/orleans-village/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2024/10/20260825-Orleans-Village-Site-Plan.pdf",
    collections: ["The Summit Series"],
    blurb: "Townhomes in east Ottawa, minutes from downtown.",
  },
  {
    id: "the-ridge",
    name: "The Ridge",
    region: "Ottawa",
    city: "Ottawa",
    url: "https://caivan.com/ottawa/the-ridge/",
    sitePlanPdf: null,
    collections: ["24′ Townhome Collection"],
    blurb: "Detached homes and townhouses in Barrhaven green space.",
  },
  {
    id: "perth",
    name: "Perth",
    region: "Ottawa",
    city: "Perth",
    url: "https://caivan.com/ottawa/perth/",
    sitePlanPdf: null,
    collections: [],
    blurb: "Caivan homes in the town of Perth.",
  },
  {
    id: "arbor-west",
    name: "Arbor West",
    region: "Greater Toronto Area",
    city: "Brampton",
    url: "https://caivan.com/greater-toronto-area/brampton/arbor-west/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2023/09/20251014-Arbor-West-Site-Plan.pdf",
    collections: ["The Summit Series"],
    blurb: "Single-detached homes and townhomes in Brampton.",
  },
  {
    id: "summer-valley",
    name: "Summer Valley",
    region: "Greater Toronto Area",
    city: "Caledon",
    url: "https://caivan.com/greater-toronto-area/caledon/summer-valley/",
    sitePlanPdf: "https://caivan.com/wp-content/uploads/2025/06/20260930-Summer-Valley-Site-Plan.pdf",
    collections: ["40′ Collection", "42′ Collection", "50′ Collection"],
    blurb: "Single-detached homes in Caledon.",
  },
  { id: "oak-valley", name: "Oak Valley", region: "Greater Toronto Area", city: "Caledon", url: "https://caivan.com/greater-toronto-area/caledon/oak-valley/", sitePlanPdf: null, collections: [], blurb: "Caledon community." },
  { id: "orchard-park", name: "Orchard Park", region: "Greater Toronto Area", city: "Caledon", url: "https://caivan.com/greater-toronto-area/caledon/orchard-park/", sitePlanPdf: null, collections: [], blurb: "Caledon community." },
  { id: "winding-walk", name: "Winding Walk", region: "Greater Toronto Area", city: "Caledon", url: "https://caivan.com/greater-toronto-area/caledon/winding-walk/", sitePlanPdf: null, collections: [], blurb: "Caledon community." },
  { id: "bronte-trails", name: "Bronte Trails", region: "Greater Toronto Area", city: "Oakville", url: "https://caivan.com/greater-toronto-area/oakville/bronte-trails/", sitePlanPdf: null, collections: [], blurb: "Oakville community." },
  {
    id: "five-oaks",
    name: "Five Oaks",
    region: "Greater Toronto Area",
    city: "Oakville",
    url: "https://caivan.com/greater-toronto-area/oakville/five-oaks/",
    sitePlanPdf: null,
    collections: [],
    blurb: "Singles and towns near parks, schools and Lake Ontario in Oakville.",
  },
];
