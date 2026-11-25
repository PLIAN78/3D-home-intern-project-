# Primitive visual audit (v6.5 baseline)

Every visible object in the game is built in code from boxes, cylinders, spheres, lathes and extrusions (`B` in `world/props.tsx`, `mat()` colours, no image textures except the ground, water and sign decals). This lists them by category, where they live, and the phase that replaces them.

Gameplay geometry is separate and **stays**. That covers:

- collision boxes (`map.ts` `collisionBoxes`);
- Rapier bodies (`sim/`);
- road and path ribbons, terrain and water planes;
- trigger spots.

Replacements swap only what is drawn. The primitive versions stay in the code as loading placeholders and as the fallback for the lowest graphics tier.

| Category | Component(s) | File(s) | Count in world | Phase |
|---|---|---|---|---|
| **People** | `Human` (player, NPCs, walkers, staff, campers, co-ops, students, riders) | `models/human.tsx`; used in `entities/Player.tsx`, `entities/Npcs.tsx`, `entities/Town.tsx`, `world/OwawaScene.tsx`, `world/Places.tsx`, `world/LakeScene.tsx`, `world/EastPhase.tsx`, `world/V6Scene.tsx`, `world/WildsScene.tsx`, `models/jetski.tsx`, `models/quadruped.tsx` | 1 player, about 25 story NPCs, 100+ city walkers, Ridge walkers, students | **1** |
| **Player vehicles** | `CarBody`, `TruckBody`, `ModelCar`, `Wheel`, `BusShell` | `models/vehicles.tsx`, `models/cars.tsx`, `models/bus.tsx`; `entities/Vehicles.tsx` | 9 ownable cars + school bus | **1** |
| **Traffic** | `TrafficCarView` (car, truck, police with `PoliceKit`) | `entities/Town.tsx` | about 60 cars across the Ridge and Owawa | **1** |
| **Parked cars** | `ParkedCar`, `StaticCar` | `world/District.tsx`, `world/AirportScene.tsx`, `world/Places.tsx` (dealership) | about 40 | **1** |
| **Construction vehicles** | mixer truck and machines built from `B` boxes | `world/Landmarks.tsx` (`JobSiteProps`), `world/EastPhase.tsx` (`TowerCrane`) | job sites | **1** (machines), 2 (crane) |
| **Houses** | Caivan Ridge homes, V6 suburban lots, North Meadows and Heron Fields (`buildSiteHomes` → shared `House3D` / placeholder houses) | `world/World.tsx` (`Homes`, `HomeBatch`), lots in `world/map.ts`, `world/v6Lots.ts`, `world/meadows.ts` | about 400 lots | **1** (finished suburban homes; the Ridge build stages stay procedural because they are the game's core mechanic) |
| **Downtown and civic buildings** | `Building`, `facade`, `CityHall`, `OwawaBlocks`, `Storefront`, `CivicBuilding`, `VisitableTower` | `world/OwawaScene.tsx`, `world/OwawaBlocks.tsx`, `world/V6Scene.tsx` | about 150 | 2 |
| **Shops, restaurants, bank, showroom, mall** | `Shop`, `Mall`, `School`, `Bank`, `Restaurant`, `Dealership`, `Clothing`, `Office`, `MallShell`, `Shawarma`, `SalesCentre`, `Factory` | `world/District.tsx`, `world/Places.tsx`, `world/MallInterior.tsx`, `world/OwawaScene.tsx`, `world/Landmarks.tsx` | about 30 | 2 |
| **Campus** | `Wing`, `Entrance`, `Skybridge` | `world/VatalooCampus.tsx` | 44 buildings | 2 |
| **Roads and street furniture** | road meshes (`buildSite`), `RoadMarkings`, `TrafficLights`, `Signals`, `StreetLights`, `Sign`, `ParkingLot`, `Walkway`, `Plaza` | `world/Countryside.tsx`, `world/TrafficLights.tsx`, `world/OwawaScene.tsx`, `world/StreetLights.tsx`, `world/props.tsx`, `world/Walkways.tsx` | whole map | 2 (PBR materials and models; the ribbons stay) |
| **Rail** | `Rail` (deck, rails, posts), `Train`, `StationEntrance` | `world/V6Scene.tsx`, `world/StationEntrance.tsx` | 6 trains, 3 stations | 3 |
| **Aviation** | `AirlinerModel`, `LightPlaneModel`, `HeliModel`, `Terminal`, `Hangar`, `Helipad` | `models/planes.tsx`, `models/heli.tsx`, `world/AirportScene.tsx` | airport | 3 |
| **Water** | `BoatModel`, `JetSkiModel`, `RiverJetSki`, `Jetty`, `Hut`, ship, `Bridge`, `Shores` props | `models/boat.tsx`, `models/jetski.tsx`, `world/LakeScene.tsx`, `world/V6Scene.tsx`, `world/Shores.tsx` | harbours, ship, jet skis | 3 |
| **Vegetation** | `Vegetation` (instanced trees), `Grass`, `Flowers`, `Bushes`, `Reeds`, `Plant`, `Planter` | `world/Vegetation.tsx`, `world/Grass.tsx`, `world/V6Scene.tsx`, `world/WildsScene.tsx`, `world/LakeScene.tsx`, `models/furniture.tsx` | thousands (instanced) | 4 |
| **Interiors, furniture, food** | `Sofa`, `Bed`, `Kitchen`, `Table`, `Chair`, `TV`, `Bookshelf`, `ShopShelf`, `Counter`, `Workstation`, `CafeTable`, `ShopFitout`, `BankSuite`, `CondoSuite`, `TowerLobby` | `models/furniture.tsx`, `world/MallInterior.tsx`, `world/Places.tsx`, `world/V6Scene.tsx` | about 20 interiors | 4 |
| **Animals** | `Quadruped`, `ElephantModel`, wildlife | `models/quadruped.tsx`, `models/animals.tsx`, `world/Wildlife.tsx` | about 50 | 4 |
| **Campground and wilds props** | `Tent`, `Campfire`, `PicnicTable`, `Rocks`, log pile | `world/WildsScene.tsx` | 1 campground, about 250 rocks | 4 |

## Draw-call and memory baseline

The primitive world is mostly unique `B` meshes, which means thousands of draw calls. A few systems are instanced or merged:

- trees, rocks, bushes and grass;
- rail structure;
- road ribbons.

The benchmark in `ASSETS.md` compares FPS and draw calls before and after each phase.
