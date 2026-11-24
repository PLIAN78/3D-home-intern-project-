# Credits and licences

Everything in *Caivan: Build It!* is free to use, modify and ship.

## Assets

| Asset | Source | Licence |
| --- | --- | --- |
| "Park" HDRI (sky lighting and reflections) | [Poly Haven](https://polyhaven.com/), bundled by [`@pmndrs/assets`](https://github.com/pmndrs/assets) | CC0 |
| All textures (grass, asphalt, concrete, dirt, bark, lumber, siding, shingles, OSB, brick, logs, standing-seam metal, shop interiors, water ripples, leaf cards) | Generated in code: `src/render/textures.ts`, `src/render/architecture.ts` | Part of this repo |
| All models (people, pickups, sports car, wheels, helicopter, horse, elephant, goats, jetpack, trees, street lights, buildings) | Built in code: `src/models/`, `src/world/` | Part of this repo |
| Interface icons | Drawn as SVG in code: `src/ui/icons.tsx` | Part of this repo |
| Map | Painted in code from the game's own map data: `src/ui/mapRender.ts` | Part of this repo |
| Houses at each construction stage, Plan 36 | Home Studio's own geometry (`lib/geometry`, `components/viewer`) | Part of this repo |
| Sound effects | Synthesised in code with Web Audio: `src/core/sfx.ts` | Part of this repo |

## Libraries

| Library | Licence |
| --- | --- |
| three.js | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| @dimforge/rapier3d-compat (Rapier physics) | Apache-2.0 |
| postprocessing | Zlib |
| @react-three/postprocessing | MIT |
| n8ao (ambient occlusion, via @react-three/postprocessing) | ISC |
| zustand | MIT |
| React | MIT |
| Vite | MIT |

## Design references (no code copied)

- pmndrs/ecctrl (MIT): character and vehicle controllers on Rapier
- swift502/Sketchbook (MIT): entering and leaving vehicles in a third-person sandbox
- Three.js Journey, "Realistic render"; al-ro's grass; Codrops "fluffiest grass"
