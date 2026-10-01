"use client";

import type { ReactNode } from "react";
import { LotLayer, LotTag, RealWorldContext, useSiteContext } from "@/components/community/RealWorldScene";
import { buildMaterial } from "@/components/community/siteMaterials";
import { placeholderScale } from "@/lib/geometry/siteGeometry";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import type { Community, Lot } from "@/lib/models/community";
import type { LotProgress } from "@/lib/models/construction";
import { GrowIn } from "./CommunityScene";

interface Props {
  community: Community;
  progress: Record<string, LotProgress | undefined>;
  selectedLotId: string;
  showBaseModel: boolean;
  showLotLabels: boolean;
  /** The customer's house, positioned in lot-local space by the caller. */
  children: ReactNode;
}

function BasePlaceholder({ lot }: { lot: Lot }) {
  const g = placeholderFor(lot);
  const [sx, , sz] = placeholderScale(lot);
  const frontLocalZ = lot.depth / 2 - lot.frontSetback;
  return (
    <group position={[-g.planCentre.x * sx, 0, frontLocalZ - g.frontY * sz]} scale={[sx, 1, sz]}>
      {g.parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={buildMaterial(p.surface, p.surface === "body" ? lot.placeholder.bodyColor : p.surface === "roof" ? lot.placeholder.roofColor : undefined)} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** A project's home on its real lot, inside the real-world community. */
export function GeoCommunityScene({ community, progress, selectedLotId, showBaseModel, showLotLabels, children }: Props) {
  const context = useSiteContext(community.id);
  const lot = community.lots.find((l) => l.id === selectedLotId);
  return (
    <group name="GeoCommunity">
      {context && <RealWorldContext context={context} community={community} showStreetNames={showLotLabels} />}
      <LotLayer community={community} progress={progress} colouring="status" selectedLotId={selectedLotId} skipHomeOnLotId={selectedLotId} />
      {lot && (
        <group position={lot.position} rotation={lot.rotation} name={`Lot ${lot.number}`}>
          <GrowIn visible={showBaseModel}>
            <BasePlaceholder lot={lot} />
          </GrowIn>
          <GrowIn visible={!showBaseModel}>{children}</GrowIn>
        </group>
      )}
      {lot && showLotLabels && (
        <LotTag lot={lot} tone="selected" text={`Lot ${lot.number} · Your Home`} />
      )}
    </group>
  );
}
