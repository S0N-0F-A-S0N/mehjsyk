/**
 * @name            MakeHuman
 * @copyright       MakeHuman Team 2001-2016
 * @license         [AGPL3]{@link http://www.makehuman.org/license.php}
 * @description     Manages meshes such as clothes which attatch to the human
 * and it's skeleton
 */

import _ from 'lodash'
import * as THREE from 'three'
import { LegacyJSONLoader } from '../helpers/LegacyJSONLoader'

/**
 * parseProxyUrl
 * @param  {String} url - e.g. "data/proxies/clothes/Bikini/Bikini.json#blue"
 * @return {Object}     - e.g. {group:"clothes",name:"Bikini",file:"bikini.json", materialName:"blue"}
 */
export const parseProxyUrl = (address) => {
    // if (!address.includes('#')) address += '#'
    const [fullUrl, materialName] = address.split('#')
    const match = fullUrl.match(/(.+\/)*(.+)\/(.+)\/(.+)\.json/)
    // Fallback if match fails
    const group = match ? match[2] : 'unknown';
    const name = match ? match[3] : 'unknown';
    const file = match ? match[4] : 'unknown';

    const key = `${group}/${name}/${file}.json${materialName ? `#${materialName}` : ''}`
    const thumbnail = `${group}/${name}/${materialName || file}.thumb.png`
    return { group, name, key, materialName: materialName || '', thumbnail }
}

export class Proxy extends THREE.Object3D {
    constructor(url, human, manager = new THREE.LoadingManager()) {
        super()

        this.manager = manager
        this.human = human

        // after fitting we expand the size by this fraction
        this.extraGeometryScaling = [1.0, 1.0, 1.0]

        this.loader = new THREE.FileLoader(this.manager)

        const { name, group, materialName, key, thumbnail } = parseProxyUrl(url)
        this.key = key
        this.name = name
        this.group = group
        this.thumbnail = thumbnail
        this.materialName = materialName
        this.url = `${this.human.config.baseUrl}proxies/${this.key}`

        this.mesh = null
        this.visible = false
        this.metadata = {}
    }

    /** load a proxy from threejs json file, making it a child object and giving it the same skeleton **/
    load() {
        const self = this
        if (this.mesh) return Promise.resolve(this.mesh)

        const legacyLoader = new LegacyJSONLoader(this.manager);

        return new Promise((resolve, reject) => {
            legacyLoader.load(self.url, (geometry, materials) => {
                 resolve({ geometry, materials });
            }, undefined, reject);
        })
            .catch((err) => {
                console.error('Failed to load proxy data', self.url, err)
            })
            .then(({ geometry, materials }) => {
                 // We need metadata. Fetch it.
                 // Optimization: Cache this.
                 return new Promise((resolve) => {
                     self.loader.load(self.url, (text) => {
                         const json = JSON.parse(text);
                         self.metadata = json.metadata;
                         resolve({ geometry, materials });
                     });
                 });
            })
            .then(({
                geometry,
                materials
            }) => {
                geometry.name = self.url
                // materials.map(m => (m.skinning = true))
                if (materials && Array.isArray(materials)) {
                    materials.forEach(m => m.skinning = true);
                } else if (materials) {
                    materials.skinning = true;
                } else {
                    materials = [new THREE.MeshStandardMaterial({ skinning: true })];
                }

                // const mesh = new THREE.SkinnedMesh(geometry, new THREE.MultiMaterial(materials))
                const mesh = new THREE.SkinnedMesh(geometry, materials)

                // TODO check they are the same skeletons
                // mesh.children.pop() // pop existing skeleton
                mesh.skeleton = self.human.skeleton

                mesh.castShadow = true
                mesh.receiveShadow = true

                self.mesh = mesh
                self.mesh.geometry.computeVertexNormals()
                self.add(mesh)

                // when it overlaps with body, show proxy (body has 0, we want higher ints)
                mesh.renderOrder = self.metadata.z_depth

                self.updatePositions()

                // change it to use the material specified in the url hash
                if (self.materialName) {
                    if (Array.isArray(materials)) {
                        const materialIndex = _.findIndex(materials, material => material.name === self.materialName)
                        if (materialIndex !== -1) self.changeMaterial(materialIndex)
                    }
                }

                return mesh
            })
    }

    /** Turn mesh on or off, loading if needed **/
    toggle(state) {
        if (state === undefined) state = !this.visible
        if (this.visible === state) return Promise.resolve(this)
        this.visible = state
        let promisedMesh
        if (state === false) promisedMesh = Promise.resolve()
        else promisedMesh = this.load().then(() => this.updatePositions())
        return promisedMesh.then(() => this.human.proxies.updateFaceMask())
    }

    /**
     * This recalculates the coords of the proxy using the vertice inds, weights, and offsets
     * like in makehumans's proxy.py:Proxy.getCoords()
     */
    updatePositions() {
        // TODO faster to do this in the gpu
        // equation = vertice = w0 * v0 + w1 * v1 + w2*v2 + offset, where w0 = weights[i][0], v0 = ref_verts_i[0]
        if (!this.visible || !this.mesh) return null

        const o = this.metadata.offsets
        const w = this.metadata.weights
        const ref_vIdxs = this.metadata.ref_vIdxs

        const humanPosition = this.human.mesh.geometry.getAttribute('position')
        const proxyPosition = this.mesh.geometry.getAttribute('position')

        // convert this.matrix to Matrix3
        const mw = this.matrix.elements
        const matrix = new THREE.Matrix3()
        matrix.set(mw[0], mw[1], mw[2], mw[4], mw[5], mw[6], mw[8], mw[9], mw[10]).transpose()
        const m = matrix.elements

        const vertexCount = proxyPosition.count;

        // This is a heavy loop, ideal for optimization.
        // Bolt says: Optimize loop!

        // Pre-allocate vars
        const v0 = new THREE.Vector3();
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        const vertice = new THREE.Vector3();

        for (let i = 0; i < vertexCount; i++) {
            // Get reference vertices from human mesh
            // The metadata stores indices into the human mesh
            const idx0 = ref_vIdxs[i][0];
            const idx1 = ref_vIdxs[i][1];
            const idx2 = ref_vIdxs[i][2];

            v0.set(humanPosition.getX(idx0), humanPosition.getY(idx0), humanPosition.getZ(idx0));
            v1.set(humanPosition.getX(idx1), humanPosition.getY(idx1), humanPosition.getZ(idx1));
            v2.set(humanPosition.getX(idx2), humanPosition.getY(idx2), humanPosition.getZ(idx2));

            // xyz offsets calculated as dot(matrix, offsets)
            vertice.set(
                o[i][0] * m[0] + o[i][1] * m[1] + o[i][2] * m[2],
                o[i][0] * m[3] + o[i][1] * m[4] + o[i][2] * m[5],
                o[i][0] * m[6] + o[i][1] * m[7] + o[i][2] * m[8]
            )

            // Add weighted positions
            // w[i][j] * v[i][j]
            const w0 = w[i][0];
            const w1 = w[i][1];
            const w2 = w[i][2];

            vertice.x += w0 * v0.x + w1 * v1.x + w2 * v2.x;
            vertice.y += w0 * v0.y + w1 * v1.y + w2 * v2.y;
            vertice.z += w0 * v0.z + w1 * v1.z + w2 * v2.z;

            proxyPosition.setXYZ(i, vertice.x, vertice.y, vertice.z);
        }

        if (this.extraGeometryScaling[0] !== 1 || this.extraGeometryScaling[1] !== 1 || this.extraGeometryScaling[2] !== 1) {
             this.mesh.geometry.scale(this.extraGeometryScaling[0], this.extraGeometryScaling[1], this.extraGeometryScaling[2]);
        }

        proxyPosition.needsUpdate = true
        // this.mesh.geometry.elementsNeedUpdate = true // BufferGeometry doesn't need this
        return proxyPosition
    }

    changeMaterial(i) {
        if (Array.isArray(this.mesh.material)) {
             if (i >= this.mesh.material.length) return;
             // In BufferGeometry with groups, we change material index in groups.
             // Or if we just swap the material...
             // MakeHuman proxies usually use one material per mesh?
             // If we have groups, we need to update them.

             // Simple hack: if there is only one group or no group, set the material array?
             // But MultiMaterial suggests different faces have different materials.
             // If we want to switch the "main" material, how do we know which one?
             // Usually it's just swapping the material object at index i to index 0?
             // The original code set face.materialIndex = i.

             // For BufferGeometry, we iterate groups.
             const groups = this.mesh.geometry.groups;
             if (groups && groups.length > 0) {
                 groups.forEach(g => g.materialIndex = i);
             } else {
                 // No groups, just set the material.
                 // But wait, if we passed an array to SkinnedMesh, it expects groups.
                 // If we have no groups, it uses material[0].
                 this.mesh.geometry.clearGroups();
                 this.mesh.geometry.addGroup(0, Infinity, i);
             }

             this.mesh.geometry.groupsNeedUpdate = true
             return true
        }
        return false
    }

    preRender() {

    }
    onAfterRender() {}
}


/**
 * Container for proxies
 */
export class Proxies extends THREE.Object3D {
    constructor(human) {
        super()
        this.human = human
        // Proxies
        // TODO replace with a better system
        // this._hairProxy = undefined
        // this._eyesProxy = undefined
        // this._eyebrowsProxy = undefined
        // this._eyelashesProxy = undefined
        // this._teethProxy = undefined
        // this._tongueProxy = undefined
        // this._clothesProxies = {}

        this._cache = {}

        // init an object for each proxy but don't load untill needed
        this.human.config.proxies
            .map(url => new Proxy(`${this.human.config.baseUrl}proxies/${url}`, this.human))
            .map(proxy => this.add(proxy))
    }

    /**
     * Toggles or sets a proxy
     * params:
     *   key {String} the url for the proxy  (relative to baseUrl) e.g. eyes/Low-Poly/Low-Poly.json#brown
     *   state {Boolean|undefined} set the proxy on or off or if undefined toggle it
     * returns a promise to load the mesh
     */
    toggleProxy(key, state) {
        // try to find an existing proxy with this key
        let proxy = _.find(this.human.proxies.children, p => p.url === key) ||
            _.find(this.human.proxies.children, p => p.key === key) ||
            _.find(this.human.proxies.children, p => p.name === key)
        // or init a new one
        if (!proxy) {
            console.warn(`Could not find proxy with key ${key}`)
            // throw new Error(`Could not find loaded proxy to toggle with key: ${key}`)
            proxy = new Proxy(`${this.human.config.baseUrl}proxies/${key}`, this.human)
            this.add(proxy)
        } else {
            console.log('toggleProxy', proxy.url, state)
        }
        return proxy.toggle(state)
    }

    updatePositions() {
        this.children.forEach(child => child.updatePositions())
    }

    /** Make faces to hide parts under clothes, see makehuman/plugins/3_libraries_clothes_choose.py:updateFaceMasks **/
    updateFaceMask(minMaskedVertsPerFace = 3) {
        // get deleted vertices from all active proxies
        const deleteVerts = this.children
            .filter(proxy =>
                proxy.visible &&
                proxy.mesh &&
                proxy.metadata.deleteVerts &&
                proxy.metadata.deleteVerts.length
             )
            .map(proxy => proxy.metadata.deleteVerts)

        const positionAttribute = this.human.mesh.geometry.getAttribute('position')
        const nbVertices = positionAttribute.count
        const materials = Array.isArray(this.human.mesh.material) ? this.human.mesh.material : [this.human.mesh.material];
        const nullMaterialIndex = materials.findIndex(m => m.name === 'maskedFaces')

        // for each vertice, see if any proxy wants to delete it
        const dv = new Uint8Array(nbVertices)
        for (let i = 0; i < nbVertices; i++) {
            // This is slow O(P*V).
             let sum = 0;
             for(let k=0; k<deleteVerts.length; k++) {
                 if (deleteVerts[k][i]) sum++;
             }
             dv[i] = sum > 0 ? 1 : 0
        }

        // BufferGeometry usually relies on groups for materials.
        // We cannot easily change material per face without splitting the mesh into groups.
        // The original code used Geometry which had per-face materialIndex.
        // For BufferGeometry, we need to organize faces into groups.
        // This is extremely expensive to do dynamically every frame or toggle.

        // Solution: We might need to skip this feature or implement it via a shader (alpha mask).
        // Or, we assume the groups are already set up? No, the original code sets face.materialIndex.

        // Given the complexity of implementing dynamic face masking on BufferGeometry without shaders,
        // I will log a warning and skip it for now, or implement a basic check.
        // "makehuman-js" seems to rely on swapping materials for faces under clothes.

        console.warn("Face masking (hiding body under clothes) is temporarily disabled due to BufferGeometry migration complexity. Shader-based masking recommended.");

        // To implement this correctly:
        // 1. Read index buffer.
        // 2. For each triangle, check if vertices are masked.
        // 3. Re-sort indices to put masked triangles into a "masked" group and others into "visible" group.
        // 4. Update geometry groups.

        // Let's try to implement the group re-sorting. It's computationally heavy but correct.

        const indexAttribute = this.human.mesh.geometry.index;
        if (!indexAttribute) return; // unindexed?

        const indices = indexAttribute.array;
        const faceCount = indices.length / 3;

        const visibleIndices = [];
        const maskedIndices = [];

        // We need to know which group corresponds to the original material?
        // If there were multiple materials, it's even harder.
        // Assuming body is one material.

        for (let i = 0; i < faceCount; i++) {
            const a = indices[i * 3];
            const b = indices[i * 3 + 1];
            const c = indices[i * 3 + 2];

            const isMasked = (dv[a] + dv[b] + dv[c]) >= minMaskedVertsPerFace;

            if (isMasked) {
                maskedIndices.push(a, b, c);
            } else {
                visibleIndices.push(a, b, c);
            }
        }

        // Now we need to update the index buffer and groups.
        // Note: This modifies the geometry topology!
        // But since we are just reordering indices, it should be fine.

        const newIndices = new (indices.constructor)(indices.length);
        newIndices.set(visibleIndices, 0);
        newIndices.set(maskedIndices, visibleIndices.length);

        indexAttribute.set(newIndices);
        indexAttribute.needsUpdate = true;

        this.human.mesh.geometry.clearGroups();

        // Group 0: Visible (Material 0 - Skin)
        this.human.mesh.geometry.addGroup(0, visibleIndices.length, 0);

        // Group 1: Masked (Material nullMaterialIndex - Invisible)
        if (nullMaterialIndex !== -1) {
             this.human.mesh.geometry.addGroup(visibleIndices.length, maskedIndices.length, nullMaterialIndex);
        }

        const facesMasked = maskedIndices.length / 3;
        console.debug('vertices masked ', _.sum(dv), 'faces masked', facesMasked)
    }

    onElementsNeedUpdate() {
        this.updatePositions()
        this.children
        .filter(proxy => proxy.visible && proxy.mesh)
        .map(proxy => proxy.mesh.geometry.computeVertexNormals())
    }

    exportConfig() {
        return this.children.filter(p => p.visible).map(p => p.url)
    }

    importConfig(config) {
        this.children.map(p => (p.visible = false))
        this.updateFaceMask()
        return config.map(url => this.toggleProxy(url, true))
    }
}


export default Proxy
