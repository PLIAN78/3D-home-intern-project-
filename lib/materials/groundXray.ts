import * as THREE from "three";

/**
 * "X-ray" ground: when a basement is on show in place (below grade), the
 * ground, lot fills and paving fade to see-through in a soft circle around
 * the house so the basement interior is visible. One set of uniforms is
 * shared by every patched material.
 */
export const xrayUniforms = {
  uXray: { value: 0 },
  uXrayCentre: { value: new THREE.Vector2() },
  uXrayRadius: { value: 10 },
};

const patched = new Set<THREE.Material>();

/** Patch a ground-type material (idempotent). */
export function withGroundXray<T extends THREE.Material>(material: T): T {
  if (patched.has(material)) return material;
  patched.add(material);
  material.addEventListener("dispose", () => patched.delete(material));
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, xrayUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vXrayPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvXrayPos = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uXray;\nuniform vec2 uXrayCentre;\nuniform float uXrayRadius;\nvarying vec2 vXrayPos;")
      .replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\n{\n  float xrK = uXray * (1.0 - smoothstep(uXrayRadius, uXrayRadius + 6.0, distance(vXrayPos, uXrayCentre)));\n  gl_FragColor.a *= 1.0 - 0.8 * xrK;\n}",
      );
  };
  // Same program for every patched material of a type; the uniforms drive it.
  material.customProgramCacheKey = () => "ground-xray";
  return material;
}

/** Ground is only transparent while the x-ray is on (keeps normal rendering opaque and cheap). */
export function setGroundXrayTransparent(on: boolean) {
  for (const m of patched) {
    if (m.userData.xrayBaseTransparent === undefined) m.userData.xrayBaseTransparent = m.transparent;
    const want = on || m.userData.xrayBaseTransparent;
    if (m.transparent !== want) {
      m.transparent = want;
      m.needsUpdate = true;
    }
  }
}
