"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import { TerrariumMeshPlugin, TilesFadePlugin, UpdateOnChangePlugin, XYZTilesOverlay } from "3d-tiles-renderer/plugins";
import { WGS84_ELLIPSOID, type TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import type { LatLng } from "@/lib/community/geo";
import { meanTerrarium, tileForLatLng, tileUrl, type SatelliteConfig } from "@/lib/community/satellite";
import { withGroundXray } from "@/lib/materials/groundXray";
import { setFlattenArea, withTerrainFlatten } from "@/lib/materials/terrainFlatten";

export type SatelliteStatus = "loading" | "ready" | "failed";

/** Load errors (with nothing loaded yet) before giving up and falling back to the map ground. */
const MAX_ERRORS_BEFORE_FALLBACK = 4;
/** Share of the current view's tiles loaded before the satellite ground replaces the map. */
const READY_PROGRESS = 0.75;
/** …or this long after the first tile, whichever comes first. */
const READY_AFTER_MS = 5000;

const heightCache = new Map<string, Promise<number>>();

/**
 * Ground height (m above sea level) at a point, read from the 3×3 pixels
 * around it in one Terrarium elevation tile. Cached per point and source.
 */
export function fetchGroundHeight(p: LatLng, config: Pick<SatelliteConfig, "terrainUrl" | "terrainMaxZoom">): Promise<number> {
  const key = `${config.terrainUrl}|${config.terrainMaxZoom}|${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  let pending = heightCache.get(key);
  if (!pending) {
    pending = (async () => {
      const t = tileForLatLng(p, config.terrainMaxZoom);
      const res = await fetch(tileUrl(config.terrainUrl, t), { mode: "cors" });
      if (!res.ok) throw new Error(`Terrain tile HTTP ${res.status}`);
      // No colour management: the RGB values encode heights, not colours.
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const { width, height } = bmp;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("No 2D canvas");
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const s = width / 256;
      const x0 = THREE.MathUtils.clamp(Math.round(t.px * s) - 1, 0, width - 3);
      const y0 = THREE.MathUtils.clamp(Math.round(t.py * s) - 1, 0, height - 3);
      return meanTerrarium(ctx.getImageData(x0, y0, 3, 3).data);
    })();
    heightCache.set(key, pending);
    // Let a later mount retry after a network failure.
    pending.catch(() => heightCache.delete(key));
  }
  return pending;
}

/**
 * Pose for the tileset group: the ground at `origin` lands on the world
 * origin with +y up, +x east and +z south — the same frame as the rest of
 * the community (x = east, z = −north).
 */
export function originFrame(origin: LatLng, groundHeight: number) {
  const m = new THREE.Matrix4();
  // Object frame (the default) at a point: +y up, +z north, +x west.
  WGS84_ELLIPSOID.getObjectFrame(origin.lat * THREE.MathUtils.DEG2RAD, origin.lng * THREE.MathUtils.DEG2RAD, groundHeight, 0, 0, 0, m);
  // Invert to bring that point to the origin, then turn half a circle so north is −z and east is +x.
  m.invert().premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);
  return { position, quaternion };
}

interface Props {
  origin: LatLng;
  /** Level area under the community (see `flattenArea`). */
  flatten: { radius: number; falloff: number };
  config: SatelliteConfig;
  onStatus?: (status: SatelliteStatus) => void;
}

/**
 * Real terrain with aerial imagery draped over it, streamed as tiles by
 * 3d-tiles-renderer. Hidden until the first tiles have loaded; reports
 * "failed" if the elevation or tile servers can't be reached.
 */
export function SatelliteGround({ origin, flatten, config, onStatus }: Props) {
  const [ground, setGround] = useState<{ key: string; height: number | null }>();
  const [tilesReady, setTilesReady] = useState(false);
  const [loadedAny, setLoadedAny] = useState(false);
  const [errors, setErrors] = useState(0);
  const originKey = `${origin.lat},${origin.lng}`;

  useEffect(() => {
    let alive = true;
    fetchGroundHeight(origin, config).then(
      (height) => alive && setGround({ key: originKey, height }),
      (err: unknown) => {
        console.warn("Satellite ground: could not read terrain height", err);
        if (alive) setGround({ key: originKey, height: null });
      },
    );
    return () => {
      alive = false;
    };
    // `origin` is captured through originKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, config]);

  const groundHeight = ground?.key === originKey ? ground.height : undefined;
  const loadFailed = errors >= MAX_ERRORS_BEFORE_FALLBACK && !loadedAny;
  const status: SatelliteStatus = groundHeight === null || loadFailed ? "failed" : groundHeight !== undefined && tilesReady && loadedAny ? "ready" : "loading";
  useEffect(() => onStatus?.(status), [status, onStatus]);

  const frame = useMemo(() => (groundHeight == null ? null : originFrame({ lat: origin.lat, lng: origin.lng }, groundHeight)), [origin.lat, origin.lng, groundHeight]);

  useLayoutEffect(() => setFlattenArea({ radius: flatten.radius, falloff: flatten.falloff }, groundHeight ?? 0), [flatten.radius, flatten.falloff, groundHeight]);

  const overlay = useMemo(() => new XYZTilesOverlay({ url: config.imageryUrl, levels: config.imageryMaxZoom + 1 }), [config.imageryUrl, config.imageryMaxZoom]);
  const terrainArgs = useMemo(() => [{ url: config.terrainUrl, maxZoom: config.terrainMaxZoom, overlay, applyOverlayTexture: true }] as [ConstructorParameters<typeof TerrariumMeshPlugin>[0]], [config.terrainUrl, config.terrainMaxZoom, overlay]);

  const tilesRef = useRef<TilesRendererImpl>(null);
  const firstLoadAt = useRef<number | null>(null);

  // Every tile: receive the house's shadows, level the community area, and join the basement x-ray.
  const onLoadModel = useCallback(
    ({ scene }: { scene: THREE.Object3D }) => {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.receiveShadow = true;
        mesh.renderOrder = -4;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) withGroundXray(withTerrainFlatten(m));
      });
      firstLoadAt.current ??= performance.now();
      setLoadedAny(true);
    },
    [],
  );

  const onLoadError = useCallback((e: { error?: unknown; url?: string | URL }) => {
    console.warn("Satellite ground: tile failed", e.url ?? "", e.error);
    setErrors((n) => n + 1);
  }, []);

  const onTilesLoadEnd = useCallback(() => setTilesReady(true), []);

  // Tiles keep refining as the camera moves, so "everything loaded" can take a while: show the
  // ground once most of the current view is in (or a few seconds after the first tile), and let
  // the rest fade in.
  useFrame(() => {
    if (tilesReady || firstLoadAt.current === null || !tilesRef.current) return;
    if (tilesRef.current.loadProgress >= READY_PROGRESS || performance.now() - firstLoadAt.current > READY_AFTER_MS) setTilesReady(true);
  });

  if (!frame) return null;
  return (
    <group name="SatelliteGround" position={frame.position} quaternion={frame.quaternion} visible={status === "ready"}>
      <TilesRenderer ref={tilesRef} onLoadModel={onLoadModel} onLoadError={onLoadError} onTilesLoadEnd={onTilesLoadEnd}>
        <TilesPlugin plugin={TerrariumMeshPlugin} args={terrainArgs} />
        <TilesPlugin plugin={TilesFadePlugin} />
        <TilesPlugin plugin={UpdateOnChangePlugin} />
      </TilesRenderer>
    </group>
  );
}
