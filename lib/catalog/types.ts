/**
 * Real-world property catalogue: what each community actually sells, with
 * links to the builder's published photos, floorplans and virtual tours.
 * Images are linked (hot-loaded from the source site), never copied.
 */

export type PhotoKind =
  | "hero" // community banner image
  | "aerial" // drone / aerial view of the community
  | "exterior" // streetscapes, finished homes, backyards
  | "elevation" // rendering of one home design's front elevation
  | "interior" // kitchens, great rooms, bedrooms, ensuites
  | "amenity" // nearby parks, transit, shops (with a caption)
  | "lifestyle" // other marketing photography
  | "site-plan" // published site plan image
  | "sales-centre" // sales centre / model home location
  | "virtual-tour"; // thumbnail that opens a 360° tour

export interface CatalogPhotoData {
  url: string;
  kind: PhotoKind;
  caption: string | null;
  /** Collection and design names, when the photo belongs to one. */
  collection?: string | null;
  design?: string | null;
  /** Link the photo opens (e.g. a virtual tour). */
  linkUrl?: string | null;
  /** Page the photo was found on. */
  sourceUrl: string;
}

export interface CatalogDesignData {
  name: string;
  /** "The Hemlock - Model Home" → true: a furnished model is open for viewing. */
  modelHome: boolean;
  soldOut: boolean;
  sqft: number | null;
  /** e.g. "Square Feet includes 551 Sq. Ft. Finished Basement". */
  sqftNote: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  floorplanPdf: string | null;
  featureSheetPdf: string | null;
  brochurePdf: string | null;
  virtualTourUrl: string | null;
  /** Interior photo shown as the tour's thumbnail. */
  tourImageUrl: string | null;
  elevations: { label: string; url: string }[];
  pageUrl: string;
}

export interface CatalogCollectionData {
  name: string;
  pageUrl: string | null;
  priceFrom: number | null;
  sqft: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  imageUrl: string | null;
  designs: CatalogDesignData[];
}

export interface SalesCentreData {
  name: string | null;
  address: string | null;
  phone: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
}

export interface CommunityPageData {
  /** Catalogue id (e.g. "the-conservancy"). */
  id: string;
  pageUrl: string;
  description: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  salesCentre: SalesCentreData | null;
  collections: CatalogCollectionData[];
  photos: CatalogPhotoData[];
  scrapedAt: string;
}

// ---------------------------------------------------------------------------
// Read models (what the database returns to pages)
// ---------------------------------------------------------------------------

export interface PhotoView {
  id: number;
  kind: PhotoKind;
  url: string;
  caption: string | null;
  linkUrl: string | null;
  sourceUrl: string;
  collectionId: string | null;
  designId: string | null;
}

export interface HomeDesignView {
  id: string;
  collectionId: string;
  name: string;
  modelHome: boolean;
  soldOut: boolean;
  sqft: number | null;
  sqftNote: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  floorplanPdf: string | null;
  featureSheetPdf: string | null;
  brochurePdf: string | null;
  virtualTourUrl: string | null;
  pageUrl: string;
  /** Elevation renderings first, then the virtual-tour thumbnail. */
  photos: PhotoView[];
}

export interface CollectionView {
  id: string;
  name: string;
  pageUrl: string | null;
  priceFrom: number | null;
  sqft: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  imageUrl: string | null;
  designs: HomeDesignView[];
}

export interface CatalogCommunityView {
  id: string;
  name: string;
  region: "Ottawa" | "Greater Toronto Area";
  city: string;
  pageUrl: string;
  sitePlanPdf: string | null;
  blurb: string;
  description: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  salesCentre: SalesCentreData | null;
  collectionNames: string[];
  scrapedAt: string | null;
  photoCount: number;
  designCount: number;
  /** Lowest published "starting from" price across collections. */
  priceFrom: number | null;
}

export interface CatalogCommunityDetail extends CatalogCommunityView {
  collections: CollectionView[];
  /** Community photography not tied to one design (hero, aerials, amenities…). */
  photos: PhotoView[];
}

/** The real homes that can be built on a lot, from its collection. */
export interface LotHomes {
  community: CatalogCommunityView;
  collection: CollectionView | null;
  /** Design whose name matches the project's model, when there is one. */
  matchedDesignId: string | null;
  /** Community photography for context. */
  photos: PhotoView[];
}

export interface CatalogSnapshot {
  source: string;
  scrapedAt: string;
  communities: CommunityPageData[];
}
