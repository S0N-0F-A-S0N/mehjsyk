## 2024-05-14 - Morph Targets Vertex Updates
**Learning:** In `src/js/human/targets.js`, `applyTargets` is doing an expensive zero-allocation violation by recreating vertices on every update:
`const vertices = this.referenceVertices.map(v => v.clone())`
This creates `O(V)` new `THREE.Vector3` objects per frame where `V` is the number of vertices, causing massive GC pressure and poor performance.
**Action:** Instead of allocating new arrays and objects, update `this.human.geometry.vertices` directly in-place from `this.referenceVertices` and apply the `dVert` offset without cloning.

## 2024-05-14 - Proxy (Clothing) Vertex Updates
**Learning:** `src/js/human/proxy.js` has a similar O(V) allocation bottleneck in `updatePositions()`. For every vertex `i` in the proxy mesh, it does:
`const vertice = new THREE.Vector3(...)`
This is called per-frame for every visible proxy. Since this creates new Vector3 objects, it puts unnecessary pressure on GC.
**Action:** Re-use the existing vertices from `this.mesh.geometry.vertices[i]` instead of allocating new `THREE.Vector3` instances. We can update `x, y, z` in place using `.set(...)` and then add the weighted vertices.
