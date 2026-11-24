import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useQuality } from "./quality";

/**
 * The finishing pass (pmndrs/postprocessing, MIT), in the order a camera would:
 * ambient occlusion grounds objects (N8AO), bloom lets head-lights, jetpack
 * flames and the sun's glints glow, a filmic tone curve (ACES) maps HDR light to
 * the screen, then light colour grading, a soft vignette and SMAA anti-aliasing.
 */
export function PostFX() {
  const high = useQuality((s) => s.level === "high");
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO aoRadius={2.2} distanceFalloff={1.2} intensity={2.2} quality="medium" halfRes /> : <></>}
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.55} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.1} />
      <BrightnessContrast contrast={0.06} brightness={0.01} />
      <Vignette offset={0.35} darkness={0.32} />
      <SMAA />
    </EffectComposer>
  );
}
