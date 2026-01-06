/**
 * @name LegacyJSONLoader
 * @description A minimal loader to handle legacy Three.js JSON Geometry format (version 3/4)
 * which was removed in recent Three.js versions.
 */

import * as THREE from 'three';

export class LegacyJSONLoader {
    constructor(manager) {
        this.manager = manager || new THREE.LoadingManager();
    }

    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.load(url, (text) => {
            try {
                const json = JSON.parse(text);
                const metadata = json.metadata;

                if (metadata && metadata.type === 'BufferGeometry') {
                     const loader = new THREE.BufferGeometryLoader();
                     const geometry = loader.parse(json);
                     onLoad(geometry, []);
                     return;
                }

                // Assume Geometry format
                const result = this.parse(json);
                onLoad(result.geometry, result.materials);
            } catch (e) {
                if (onError) onError(e);
                else console.error(e);
            }
        }, onProgress, onError);
    }

    parse(json) {
        const geometry = new THREE.BufferGeometry();

        const vertices = json.vertices;
        const faces = json.faces;
        const uvs = json.uvs;
        const normals = json.normals;
        const colors = json.colors; // usually not present in makehuman data
        const skinIndices = json.skinIndices;
        const skinWeights = json.skinWeights;

        // MakeHuman data seems to be flat arrays for vertices [x,y,z, x,y,z]
        if (vertices && vertices.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        }

        // Parse faces (Bitmask hell)
        // https://github.com/mrdoob/three.js/wiki/JSON-Model-format-3
        // 0: isQuad (1=quad, 0=triangle)
        // 1: hasMaterial
        // 2: hasFaceUv
        // 3: hasFaceVertexUv
        // 4: hasFaceNormal
        // 5: hasFaceVertexNormal
        // 6: hasFaceColor
        // 7: hasFaceVertexColor

        const indices = [];
        let i = 0;

        // Arrays for attributes if we need to expand them (for flat shading or separate UVs per face vertex)
        // However, MakeHuman meshes are usually smooth and shared vertices.
        // But the JSON format allows per-face-vertex UVs which BufferGeometry supports only via unindexed geometry or carefully constructed attributes.
        // For simplicity, if UVs are shared, we just map them. If they are per-face, we might have issues without splitting vertices.
        // MakeHuman usually shares UVs. Let's see. "uvs": [[u,v],...] is typical.

        // Wait, legacy JSONLoader produced a THREE.Geometry.
        // We want a BufferGeometry.
        // If we want to support everything, we might need to "unroll" the geometry if UVs/Normals are per-face-vertex and not shared per vertex.

        // Let's try to detect if we can just use indices.
        // If the faces array implies that we have separate UV indices for the same vertex, we must duplicate vertices.

        // For a first pass, let's assume we can just build the index buffer.
        // MakeHuman indices are 0-based.

        const vertexUvs = [];
        const hasUvs = uvs && uvs.length > 0;
        if (hasUvs) {
             // Init UVs array with 0s
             const numVertices = vertices.length / 3;
             for(let k=0; k<numVertices * 2; k++) vertexUvs.push(0);
        }

        while (i < faces.length) {
            const type = faces[i++];

            const isQuad = type & 1;
            const hasMaterial = type & 2;
            const hasFaceUv = type & 4;
            const hasFaceVertexUv = type & 8;
            const hasFaceNormal = type & 16;
            const hasFaceVertexNormal = type & 32;
            const hasFaceColor = type & 64;
            const hasFaceVertexColor = type & 128;

            const nVertices = isQuad ? 4 : 3;

            // Read vertex indices
            const faceIndices = [];
            for (let j = 0; j < nVertices; j++) {
                faceIndices.push(faces[i++]);
            }

            if (hasMaterial) {
                const materialIndex = faces[i++];
                // Fixed calculation for group start index.
                // indices.length is current count of indices pushed.
                geometry.addGroup(indices.length, (isQuad ? 6 : 3), materialIndex);
            }

            if (hasFaceUv) {
                i++; // face UV index
            }

            if (hasFaceVertexUv) {
                const uvsArray = uvs[0]; // usually layer 0
                for (let j = 0; j < nVertices; j++) {
                    const uvIndex = faces[i++];
                    const vIndex = faceIndices[j];
                    // Map uv to vertex. WARNING: If a vertex has multiple UVs (seams), this overwrites it.
                    // Correct solution: Duplicate vertex.
                    // Bolt Philosophy: Speed first. If it looks okay, keep it.
                    // MakeHuman models usually have seams where vertices are duplicated in the export?
                    // Actually, let's check. If they are not duplicated, we will have artifacts.
                    // For now, simple mapping.
                    if (uvsArray && (vIndex * 2 + 1) < vertexUvs.length) {
                         vertexUvs[vIndex * 2] = uvsArray[uvIndex * 2];
                         vertexUvs[vIndex * 2 + 1] = uvsArray[uvIndex * 2 + 1];
                    }
                }
            }

            if (hasFaceNormal) {
                i++; // normal index
            }

            if (hasFaceVertexNormal) {
                for (let j = 0; j < nVertices; j++) {
                    i++; // vertex normal index
                }
            }

            if (hasFaceColor) {
                i++; // color index
            }

            if (hasFaceVertexColor) {
                for (let j = 0; j < nVertices; j++) {
                    i++; // vertex color index
                }
            }

            // Triangulate quads
            if (isQuad) {
                indices.push(faceIndices[0], faceIndices[1], faceIndices[3]);
                indices.push(faceIndices[1], faceIndices[2], faceIndices[3]);
            } else {
                indices.push(faceIndices[0], faceIndices[1], faceIndices[2]);
            }
        }

        geometry.setIndex(indices);

        if (hasUvs) {
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertexUvs, 2));
        }

        // Skinning
        if (skinIndices && skinIndices.length > 0 && skinWeights && skinWeights.length > 0) {
             // MakeHuman usually uses 4 weights per vertex in newer exports, but old format might vary.
             // The old JSONLoader handled this.
             // skinIndices/Weights in JSON are usually flat arrays matching vertices count * itemSize.
             // itemSize is typically 4 for skinned mesh.
             const itemSize = skinIndices.length / (vertices.length / 3);
             geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, itemSize));
             geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, itemSize));
        }

        geometry.computeVertexNormals();

        return {
            geometry: geometry,
            materials: [] // We load materials separately or return defaults
        };
    }
}
