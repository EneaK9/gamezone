// Eyes: the MakeHuman eyeball texture with the iris recoloured in the shader (any colour,
// Sharingan tomoe, hollow black sclera, glow), and a wet additive cornea glaze.

import * as THREE from "three";

export type EyeStyle = "normal" | "sharingan" | "hollow" | "glow";

export interface EyeUniforms {
  irisColor: { value: THREE.Color };
  irisMix: { value: number };
  style: { value: number };
  glow: { value: number };
  spin: { value: number };
  /** 0 open … 1 closed-left-eye overlay (Zoro), handled by lids; kept for effects. */
}

// Iris centres of the two drawn eyeballs in the MakeHuman eye texture (uv, v up).
const IRIS_A = "vec2(0.707, 0.703)";
const IRIS_B = "vec2(0.289, 0.293)";

export function eyeMaterials(map: THREE.Texture, color: string | undefined, style: EyeStyle = "normal"): { ball: THREE.MeshStandardMaterial; cornea: THREE.MeshStandardMaterial; uniforms: EyeUniforms } {
  const uniforms: EyeUniforms = {
    irisColor: { value: new THREE.Color(color ?? "#4a3020") },
    irisMix: { value: color ? 1 : 0 },
    style: { value: ["normal", "sharingan", "hollow", "glow"].indexOf(style) },
    glow: { value: style === "glow" ? 1 : 0 },
    spin: { value: 0 },
  };
  const ball = new THREE.MeshStandardMaterial({ map, roughness: 0.38 });
  ball.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 irisColor;
        uniform float irisMix;
        uniform float style;
        uniform float glow;
        uniform float spin;
        vec3 eyeEmit = vec3(0.0);`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec2 ca = ${IRIS_A};
          vec2 cb = ${IRIS_B};
          vec2 c = distance(vMapUv, ca) < distance(vMapUv, cb) ? ca : cb;
          vec2 q = vMapUv - c;
          float d = length(q);
          float irisR = 0.108;
          float iris = 1.0 - smoothstep(irisR * 0.9, irisR * 1.03, d);
          float l = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          // Keep the iris fibres from the photo, in the new colour.
          vec3 fibres = irisColor * (0.3 + 1.9 * l);
          diffuseColor.rgb = mix(diffuseColor.rgb, fibres, iris * irisMix);
          float pupil = 1.0 - smoothstep(0.031, 0.037, d);
          if (style > 0.5 && style < 1.5) {
            // Sharingan: red iris, dark ring, three tomoe.
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.02, 0.03) * (0.6 + 0.8 * l), iris);
            float ring = 1.0 - smoothstep(0.004, 0.008, abs(d - irisR * 0.58));
            float tomoe = 0.0;
            for (int k = 0; k < 3; k++) {
              float a = spin + float(k) * 2.0944;
              vec2 tc = vec2(cos(a), sin(a)) * irisR * 0.58;
              float blob = 1.0 - smoothstep(0.011, 0.015, distance(q, tc));
              vec2 tail = vec2(cos(a - 0.45), sin(a - 0.45)) * irisR * 0.6;
              blob = max(blob, (1.0 - smoothstep(0.004, 0.007, distance(q, tail))) * 0.9);
              tomoe = max(tomoe, blob);
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), max(ring, tomoe) * iris);
            eyeEmit += vec3(0.5, 0.0, 0.0) * iris * (1.0 - max(ring, tomoe)) * 0.6;
          } else if (style > 1.5 && style < 2.5) {
            // Hollow: black sclera, gold iris.
            diffuseColor.rgb = mix(vec3(0.012), vec3(0.85, 0.66, 0.2) * (0.5 + l), iris);
            eyeEmit += vec3(0.6, 0.45, 0.1) * iris * 0.5;
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008), pupil * (style > 1.5 && style < 2.5 ? 0.0 : 1.0));
          eyeEmit += irisColor * iris * glow * 1.6;
        }`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += eyeEmit;");
  };
  ball.customProgramCacheKey = () => "eye";
  // The cornea only adds light: a wet highlight and environment reflection.
  const cornea = new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.03, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  return { ball, cornea, uniforms };
}
