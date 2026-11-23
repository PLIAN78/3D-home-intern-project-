import { useEffect, useMemo } from "react";
import { buildMaterial } from "@/components/community/siteMaterials";
import { asphaltMat, buildSite, concreteMat, curbMat, GrowIn, groundMat, type DrivewaySpec } from "@/components/viewer/CommunityScene";
import { House3D, useHouseGeometry } from "@/components/viewer/House3D";
import { Trees } from "@/components/viewer/Trees";
import { ViewerContextProvider } from "@/components/viewer/ViewerContext";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import { buildSiteHomes } from "@/lib/geometry/siteGeometry";
import { PLAN_36 } from "@/lib/sample/plan36";
import { houseOffsetOnLot } from "@/lib/viewer/placement";
import { useGame } from "../game/store";
import { CAIVAN_RIDGE, HERO_LOT_ID, lotById, progressFor } from "./map";
import { Landmarks } from "./Landmarks";

/** Roads, sidewalks and driveways from Home Studio's community site builder. */
function Ground() {
  const site = useMemo(() => {
    const driveways: DrivewaySpec[] = CAIVAN_RIDGE.lots.map((lot) => {
      const g = placeholderFor(lot);
      const off = houseOffsetOnLot(lot, g);
      return { lot, start: [g.garageDoor.x + off[0], g.garageDoor.y + off[2]], startY: 0.05, width: 5.4 };
    });
    return buildSite(CAIVAN_RIDGE, driveways);
  }, []);
  useEffect(() => () => Object.values(site).forEach((g) => g.dispose()), [site]);
  return (
    <group name="Ground">
      <mesh geometry={site.ground} material={groundMat()} receiveShadow />
      <mesh geometry={site.asphalt} material={asphaltMat()} receiveShadow />
      <mesh geometry={site.concrete} material={concreteMat()} receiveShadow />
      <mesh geometry={site.curb} material={curbMat()} receiveShadow />
    </group>
  );
}

/** Every home at its construction stage, merged into a few draw calls (Home Studio's build-stage renderer). */
function Homes() {
  const stages = useGame((s) => s.stages);
  const heroRevealed = useGame((s) => s.heroRevealed);
  const homes = useMemo(() => buildSiteHomes(CAIVAN_RIDGE.lots, progressFor(stages), heroRevealed ? HERO_LOT_ID : undefined), [stages, heroRevealed]);
  useEffect(() => () => homes.meshes.forEach((m) => m.geometry.dispose()), [homes]);
  return (
    <group name="Homes">
      {homes.meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={buildMaterial(m.surface, m.color)} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** The Nguyens' Plan 36 home: Home Studio's full procedural house, revealed at the Grand Opening. */
function HeroHouse() {
  const heroRevealed = useGame((s) => s.heroRevealed);
  const geometry = useHouseGeometry(PLAN_36);
  const lot = lotById(HERO_LOT_ID);
  const offset = useMemo(() => houseOffsetOnLot(lot, geometry), [lot, geometry]);
  return (
    <ViewerContextProvider value={{ projectId: "", interactive: false }}>
      <group position={lot.position} rotation={lot.rotation} name="HeroHouse">
        <GrowIn visible={heroRevealed}>
          <group position={offset}>
            <House3D geometry={geometry} />
          </group>
        </GrowIn>
      </group>
    </ViewerContextProvider>
  );
}

export function World() {
  return (
    <group name="World">
      <Ground />
      <Homes />
      <HeroHouse />
      <Trees trees={CAIVAN_RIDGE.trees} />
      <Landmarks />
    </group>
  );
}
