# Reboot — World Art Direction

Status: Stage 1 (audit) complete. Stage 2 (design) complete. Stage 3 (implementation) pending code mode.

---

## 1. Audit — what actually exists

**Stack:** Vite + React 18 + TypeScript, `@react-three/fiber` 8, `three` 0.169, `@react-three/drei`, `@react-three/postprocessing` (N8AO + Bloom + ToneMapping + SMAA), zustand stores, Supabase. No glTF asset pipeline — all three.js geometry is generated in TypeScript.

**World structure**
- `pages/PlanetPage.tsx` — gate (auth + 30-day unlock), then lazy `CityWorldModule`.
- `modules/cityworld/CityWorldManager.tsx` — the single `<Canvas>`: tone mapping, fog, shadow rig, postprocessing, orbital hub vs surface district, HUD, exploration mode, project detail, landmark console.
- `modules/cityworld/OrbitalWorld.tsx` — orbital hub: instanced crust plates + towers on a sphere, rings, orbit station, beacons.
- `modules/cityworld/OrbitalWorld` → descend → `CITY_SCENES[category]` (lazy, `cityScenes.ts`).
- `cities/DistrictScene.tsx` — the shared surface scene: sky, terrain, arrival skyline, mega title, exploration sites, district craft, landmark, activity, life forms, then one `CityTower` per project record.
- `cities/cityKit.tsx` — `makeTowerDNA` (layout per city), `CityTower` (status-driven: abandoned leans + goes dark, reviving wears scaffolding, alive glows), `FillerSkyline` (instanced filler).
- `environment/` — `CitySky` (shader), `DistrictTerrain` (flat terrain), `DistrictCraft` (generic craft), `DistrictIdentity` (generic detail), `Landmarks.tsx` (one authored landmark per city), `CityEnvironment`, `Weather`, `LifeForms`, `CityActivity`, `DistrictTerrain`, `ReflectionLighting`, `ScenePrimitives` (`Architecture` + `Parts` batching), `SurfaceMaterials` (procedural PBR maps).
- `environment/cityDesign.ts` — `CITY_STORIES` (purpose, sites, roles), `viewFor` (5 viewpoints), `CITY_LIGHTING`.
- `cityRegistry.ts` — 11 cities with palette, environment fog, layout (`radial|grid|arc|spiral|scatter|boulevard`), overview camera.
- `worldManifest.ts` — exploration profile per city (copy, architecture note, paths, weather kind, gravity, NPC, discoveries).

**The visual problem, precisely**
1. All eleven districts share *one* generic architecture kit (`DistrictCraft`, `DistrictIdentity`, `FillerSkyline`) plus one generic terrain plane. Cities differ by accent colour, fog colour and layout radius only.
2. Buildings are the same box/cylinder massing at different scales. Silhouette variety is near zero.
3. Terrain is flat. There is no elevation, no district geography, no sightline composition.
4. Lighting is one shared rig with a per-city tint; no city has its own light logic.
5. Landmarks are authored and genuinely distinct — the strongest existing asset, and the right anchor for a per-city redesign.
6. Atmosphere is one shader sky + one particle count. No volumetric depth, no light shafts, no per-city air.

**Fixed by the product — must not change:** city IDs, names, landmark names, project records and statuses, `CITY_STORIES` copy, district layout anchors, navigation, viewpoints, exploration, economy, auth, Supabase calls, the Second Dawn overlay system.

**Note on scope:** the brief names "Echo City". It does not exist in the roster. Its concept (branching possibilities, mirrored planes) is assigned to **AI City**, whose existing purpose is "Connections can reveal possibilities no one noticed."

---

## 2. The eleven worlds

Every row below is a different *civilisation*, not a recolour. Terrain language, building language, landmark construction, light logic and animation are each specified separately.

### 01 · Graveyard — The Drowned Archive
| Element | Design |
|---|---|
| Identity | What remains when an idea goes quiet. Custody of failed work. |
| Silhouette | A sunken crater basin: three broken concentric terraces descending into a black glass pool, spires leaning inward. |
| Architecture | Obsidian basalt monoliths, snapped arcades, ribbed vault shells with missing segments, half-buried pylons, sealed doorways. Nothing is vertical; every mass sags 2–7°. |
| Terrain | Dry sea basin, crater rim, cracked salt flats, terraced collapse steps, standing water as black mirrors. |
| Landmark | **Forgotten Archive** — a split cathedral vault, open to the sky, enclosing an extinguished black sun and a rose window of dead glass. |
| Palette | Ash `#4a4f5e`, bone `#8e8a86`, oxblood `#FF5959` only in embers, black water `#0a0808`. |
| Lighting | Low raking amber from the horizon, no fill from above, long soft shadows, ember point lights only. |
| Animation | Drifting ash columns, slow orbital debris around the black sun, one window flickering on a long irregular cycle. |

### 02 · Revival City (IdeaHub) — The Scaffold Garden
| Element | Design |
|---|---|
| Identity | A second chance, built piece by piece. |
| Silhouette | A construction canyon split by an unjoined bridge; two staggered halves rising toward each other. |
| Architecture | Exposed structural skeletons, copper and brass scaffolding, half-clad volumes, growing lattice towers, crane masts, temporary walkways. Reads as "in progress", not "ruined". |
| Terrain | Stepped working terraces, gravel pads, crane rails, a chasm between the halves. |
| Landmark | **Second Chance Engine** — twin gantry arches cradling a suspended hexagonal core, with a lifting ring that carries blocks upward. |
| Palette | Patina `#5aebbf`, raw brass `#c49a6b`, wet concrete `#0d0f0a`. |
| Lighting | Bright overcast daylight, warm work lamps at the base, dust in shafts between gantries. |
| Animation | Assembly arm placing a block on a loop, welding sparks, slowly rising platform, swinging cable. |

### 03 · Success City (Legend) — The Ascent
| Element | Design |
|---|---|
| Identity | Ideas that endured. A place to remember the work. |
| Silhouette | A monumental acropolis on a cliff above cloud: grand stair axis, symmetrical wings, twin spires. |
| Architecture | Ivory colonnades, tall arches, huge plinths, polished stone, sky bridges between wings, terraced galleries. Crisp and deliberate — the only city with perfect symmetry. |
| Terrain | Cliff plateau, ceremonial stair, terraces, cloud sea below the rim. |
| Landmark | **Legacy Spire** — split twin spire over a colonnade ring, with a stair of light descending to the plaza. |
| Palette | Bone `#e0d5ba`, gold `#FFD27A`, deep stone shadow `#0d0f1a`. |
| Lighting | Golden hour, low sun, very long shadows, warm haze, moving cloud sea below the cliff. |
| Animation | Slow cloud drift below, a single ring turning at the spire crown, banners slack in a light wind. |

### 04 · AI City — The Cortex (branching possibilities)
| Element | Design |
|---|---|
| Identity | A civilisation thinking together; every connection opens another possible future. |
| Silhouette | A floating hexagonal computation plate in darkness, concentric data terraces stepping down toward a luminous core — a city with no horizon. |
| Architecture | Tendon frames, suspended data volumes, filament bundles instead of windows, hexagonal lattice towers, mirrored plates that read as parallel versions of the same structure. |
| Terrain | No ground plane; hex plate segments at three elevations, dark void beneath, thin walkway filaments. |
| Landmark | **Intelligence Core** — a visible neural volume cradled by six tendons, orbited by two rings, with branching filaments leaving the crown. |
| Palette | Cyan `#3DD8FF` on near-black `#08131c`, cold steel, violet `#327dff` in the filaments. |
| Lighting | Self-lit: filaments and core are the light source, cold rim from above, no sky. |
| Animation | Pulses travelling outward along filaments, hex plates breathing vertically, a mirrored plate drifting out of alignment. |

### 05 · Gaming City — The Arcade Cascade
| Element | Design |
|---|---|
| Identity | Worlds within worlds, waiting to be played. |
| Silhouette | Stacked voxel cliffs with an impossible staircase descending between them; playfield platforms at four heights. |
| Architecture | Chunky stepped blocks, cabinet-like facades, gate arches, jump pads, checkpoint pylons, pixel-crown roofs. Deliberately *toy* scale in places. |
| Terrain | Stepped block cliffs, floating platforms, a descending run of platforms, void below. |
| Landmark | **Infinite Arcade** — a walk-through neon gate with a stepped pixel crown and a floating playfield beneath. |
| Palette | Magenta `#B44DFF`, amber `#FFB547`, deep plum `#140d0a`. |
| Lighting | Night, high-contrast neon, strong bloom, black sky with hard pixel stars. |
| Animation | Rotating coin glyph, checkpoint pulse running along the staircase, platform drifting on a loop. |

### 06 · Education City — The Living Library
| Element | Design |
|---|---|
| Identity | Knowledge grows where ideas connect. |
| Silhouette | Terraces spiralling up a colossal tree; the canopy is a library. |
| Architecture | Stacked reading terraces, suspended page-slabs as roofs, arcades of closed books, branch-bridges between levels, lantern pavilions. |
| Terrain | Root plateaus, spiral path, canopy shelves, shaded floor. |
| Landmark | **Knowledge Tree** — colossal trunk with layered open books as canopy and three slow orbit rings of hanging lanterns. |
| Palette | Parchment `#e0d5ba`, sage `#8fb9a0`, ink `#081410`. |
| Lighting | Warm afternoon shafts through canopy, dappled leaf gobo on the ground, dust motes. |
| Animation | Pages turning on the reading terraces, canopy sway, lantern drift. |

### 07 · Health City — The Tidal Sanatorium
| Element | Design |
|---|---|
| Identity | An ecosystem of care and renewal. |
| Silhouette | Terraced pools stepping down to water, white pavilions, one great glass dome above them. |
| Architecture | Curved white and sea-glass structures, arcades half-submerged, roof gardens, canopy walkways, water channels through the plan. |
| Terrain | Tidal terraces, shallow reflecting pools, mist, low waterline. |
| Landmark | **Regeneration Garden** — glass conservatory dome around a mature tree above a reflecting pool, petals of ribs opening outward. |
| Palette | Pale mint `#68e7bd`, sea glass `#6fae9c`, warm sand `#b5f3df`. |
| Lighting | Soft dawn; the water is the second light source (upward bounce), caustics on the arches. |
| Animation | Water ripple + caustic drift, mist rising, one petal rib slowly opening. |

### 08 · Creative City (Creator) — The Unfinished Gallery
| Element | Design |
|---|---|
| Identity | Unfinished imagination takes physical form. |
| Silhouette | No ground: layered floating galleries, tilted frames, a void at the centre. |
| Architecture | Oversized picture frames as buildings, suspended canvas slabs, stairs that end in air, sculptures at impossible angles, gallery halls opening off nothing. |
| Terrain | Floating platform strata at four depths, no horizon line. |
| Landmark | **Imagination Engine** — a giant tilted frame around a void with fragments orbiting it, rearranging. |
| Palette | Rose `#FF4DD8`, slate blue `#4D8CFF`, bone `#1a1024` ground. |
| Lighting | Theatrical: key from below in coloured gels, hard edges, deep black elsewhere. |
| Animation | Fragments orbiting and reassembling, a frame rotating on its own axis, canvas catching light. |

### 09 · Space City — The Observatory Shelf
| Element | Design |
|---|---|
| Identity | Look beyond the edge of what is known. |
| Silhouette | A crescent asteroid shelf: dish on the high point, hangars cut into rock, a docking spine extending into space. |
| Architecture | Low domes, ring habitats, hangars cut into rock, antenna masts, solar arrays, a long docking spine with lit docking collars. |
| Terrain | Asteroid shelf with a sharp drop-off, craters, zero-atmosphere horizon, stars visible down to the ground. |
| Landmark | **Cosmic Observatory** — giant inclined dish, astronomical clock rings, and a true star field above. |
| Palette | Midnight `#7bb8ff`, violet `#a58bff`, titanium `#090d21`. |
| Lighting | One harsh sun, razor shadows, zero ambient, star rim light. |
| Animation | Dish tracking, solar arrays turning, a slow ship on approach to the dock, ring rotation. |

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d6571d5ecfee3d888630c4e3de596752521552450ad0281fc05f8bf9eb3629ad -->

### 10 · Robotics City — The Foundry Line

<!-- /coderabbit-ai-generated:v1 -->
| Element | Design |
|---|---|
| Identity | Machines making room for the next invention. |
| Silhouette | A deep industrial trench with gantry rails crossing overhead and chimneys on the rim. |
| Architecture | Assembly halls, conveyor halls, articulated arms the size of buildings, half-built machine hulls, chimney stacks, catwalks. Machine parts are architecture. |
| Terrain | Industrial trench, ramps, conveyor runs, overhead crane rails. |
| Landmark | **Forge Core** — reactor column ringed by magnetic rings with articulated arms feeding it. |
| Palette | Graphite `#20343d`, rust amber `#ffad53`, spark mint `#54efc0`. |
| Lighting | Furnace orange from below, cool skylight from above — two-direction rig, dust in the beams. |
| Animation | Conveyor motion carrying components, arm articulation, sparks at the forge, crane traversing. |

### 11 · Community City — The Hearth Terraces
| Element | Design |
|---|---|
| Identity | Different ideas. One common ground. |
| Silhouette | A hillside of terracotta homes wrapping a central courtyard and a great tree. |
| Architecture | Small clustered homes, awnings, market stalls, laundry lines, warm plaster walls, timber walkways, lantern strings. Human scale — the only city with no towers. |
| Terrain | Hillside terraces, steps, courtyard, garden plots. |
| Landmark | **Common Ground** — circular open forum around a shade tree with a canopy roof and long communal tables. |
| Palette | Terracotta `#c07a5a`, teal `#50ddc5`, warm cream `#ffc88a`. |
| Lighting | Late golden afternoon, then lantern dusk; the warmest city. |
| Animation | Lanterns swaying, cloth moving, smoke from chimneys, residents crossing the courtyard. |

---

## 2b. The interface (HUD redesign, one identity across eleven worlds)

The HUD is the archive's instrument, not part of any city. It stays identical in structure everywhere and is re-tinted only by the city's accent. It must recede so the world reads.

**Framing model.** Instead of stacked translucent cards floating over the scene, the interface sits in a single open frame: a hairline top rail, a left city plate, a bottom district rail, and a right record panel that appears on demand. No rounded panels on the world; corners are square or cut, borders are 1px with one accent rule, fills are near-opaque ink rather than heavy blur.

- **Top rail** — archive mark, current view (`ORBITAL` / `SURFACE CITY`), `Share view`, `Flight school`. 9px mono, 0.16em tracking.
- **City plate (left)** — city name in Georgia at 34–38px, the `CITY_STORIES` purpose line, then three engraved rows: landmark, records count, status split. A single accent hairline runs its left edge.
- **District rail (bottom)** — all eleven cities, one row, each with name and a 1px accent rule that lights on hover/selection. This is the primary navigation and replaces the old chip row.
- **Record panel (right)** — opens from the city plate or a building click: project name, status, stage, category, views. Status colour is a dot, never a stripe.
- **Dock (bottom right)** — `Archive`, `My City`, `Building shop`, compact and quiet.
- **Cinematic moments** — arrival, descent and landmark framing dim the full HUD to 0 and show only a two-line caption with the city name and the transit stage, then restore. No progress theatre.

**Rules.** One accent per screen (the city accent). Emissive bloom belongs to the world only, never to panel edges. No invented telemetry, coordinates, version numbers or fake recency. Every string is a stored field, fixed copy, or a count. All type sizes and spacing follow the existing Second Dawn scale so the change reads as a refinement, not a new product.

## 3. Shared systems (build once, use eleven times)

1. **`worlds/kit/shapes.ts`** — reusable authored geometry: arch, vault rib, colonnade, lattice tower, cantilever slab, frame, dish, truss, terrace ring, stair run, chimney. Each returns merged geometry.
2. **`worlds/kit/terrain.ts`** — heightfield + mesh generator driven by a per-city profile function (`crater`, `canyon`, `cliff`, `plate`, `trench`, `hillside`, `void`), plus terrain-specific extra meshes.
3. **`worlds/kit/materials.ts`** — procedural PBR bank per material language (basalt, plaster, brass, marble, glass, rusted steel, sea glass, canvas) using the existing `SurfaceMaterials` approach. Shared, deterministic, no remote textures.
4. **`worlds/kit/sky.ts`** — one shader with per-city uniforms: gradient, sun, stars, clouds, dust, aurora, void. Replaces `CitySky`'s single mode.
5. **`worlds/kit/lighting.ts`** — a rig descriptor per city (key, fill, bounce, emissive budget, shadow casting), replacing the shared rig.
6. **`worlds/kit/atmosphere.ts`** — bounded fog volumes, ground mist, light shafts at authored sources, per-city particle type and count.
7. **`worlds/kit/buildings.ts`** — a *silhouette archetype* system: each city supplies 4–7 archetypes (massing + roof + facade + proportion) and a weighted distribution. Project towers keep real status semantics (abandoned/reviving/alive) inside each archetype.
8. **`worlds/<City>/`** — one module per city: `profile.ts` (palette/light/atmospherics), `terrain.ts`, `blocks.ts` (non-project architecture), `landmark.tsx`, `props.tsx`, `motion.ts`.

`DistrictScene` becomes a thin host: `WorldHost` picks the city module and composes terrain → blocks → landmark → project towers → props → atmosphere.

## 4. Performance budget per city
- 1 shadow-casting directional light max; landmark + project towers only.
- Instanced or merged geometry for every repeated part; target ≤ 120 draw calls per district.
- Fillers instanced at ≤ 220 instances, LOD-culled beyond 120 units.
- Particles ≤ 400 (≤ 120 in reduced effects).
- Existing N8AO + Bloom retained; bloom threshold raised so only emissives bloom.
- Reduced-effects mode keeps all silhouettes and drops fine normals, shafts, mist, extra particles.

## 5. Delivery sequence
1. Shared kit + `WorldHost` refactor (no visual regression on AI, which stays the control).
2. Flagship four: Graveyard, Revival, Success, AI → screenshot matrix → fix.
3. Remaining seven: Gaming, Education, Health, Creative, Space, Robotics, Community.
4. Full eleven-city screenshot matrix from Entrance / Landmark / Skyline per city, side-by-side comparison, honest deficiency pass.
5. Regression: navigation, descent, project selection, detail panel, exploration walk mode, weather, reduced effects, auth gate, data loads, build + typecheck.
