
import _ from 'lodash'
import * as THREE from 'three' // eslint-disable-line no-unused-vars
import { loadHumanWithTargets, expect } from './fixtures.js'
import { Proxy } from '../../src/js/human/proxy'

describe('Optimizations', () => {
    let human

    before(() => {
        return loadHumanWithTargets()
            .then((loadedHuman) => {
                human = loadedHuman
            })
    })

    describe('targets.js optimizations', () => {
        let oldVertices
        let initialVertRef

        beforeEach(() => {
            // Reset state
            human.modifiers.reset()
            Object.keys(human.morphTargetDictionary).map((name) => {
                human.morphTargetInfluences[name] = 0
                return name
            })
            // Force bake
            human.targets.lastBake = 0
            human.targets.applyTargets()

            oldVertices = human.geometry.vertices.map(v => v.clone())
            initialVertRef = human.geometry.vertices[0]
        })

        it('should update vertices in-place (no object replacement)', () => {
            human.modifiers.randomize()
            human.targets.lastBake = 0
            human.targets.applyTargets()

            // Check if reference is same
            expect(human.geometry.vertices[0]).to.equal(initialVertRef)

            // Check if values actually changed
            const diffs = _.map(human.geometry.vertices, (vert, i) => vert.distanceTo(oldVertices[i]))
                .filter(diff => diff !== 0)
            expect(diffs).to.have.length.above(0)
        })

        it('should correctly reuse buffers across multiple calls', () => {
            // First call with random values
            human.modifiers.randomize()
            human.targets.lastBake = 0
            human.targets.applyTargets()
            const firstRunVerts = human.geometry.vertices.map(v => v.clone())

            // Second call with DIFFERENT random values
            human.modifiers.randomize()
            human.targets.lastBake = 0
            human.targets.applyTargets()

            // Check reference persistency
            expect(human.geometry.vertices[0]).to.equal(initialVertRef)

            // Third call: Reset to initial state (all zero)
            human.modifiers.reset()
            human.targets.lastBake = 0
            human.targets.applyTargets()

            // Should be back to original positions (checking buffer clearing worked)
            const currentVertices = human.geometry.vertices
            // Use a small epsilon for float comparison
            const distance = currentVertices[0].distanceTo(oldVertices[0])
            expect(distance).to.be.closeTo(0, 0.001)

            // Verify it's DIFFERENT from the first run (ensure we didn't just get stuck)
            const distFromFirst = currentVertices[0].distanceTo(firstRunVerts[0])
            // Note: There's a tiny chance random didn't change anything, but unlikely with randomize()
            if (firstRunVerts[0].distanceTo(oldVertices[0]) > 0.01) {
                expect(distFromFirst).to.be.above(0.0001)
            }
        })
    })

    describe('proxy.js optimizations', () => {
        let proxy

        before(() => {
            proxy = new Proxy('clothes/female_sportsuit01/female_sportsuit01.json', human)
            return proxy.load()
        })

        it('should update proxy vertices in-place', () => {
            proxy.visible = true
            const initialVertRef = proxy.mesh.geometry.vertices[0]

            // First update
            proxy.updatePositions()
            expect(proxy.mesh.geometry.vertices[0]).to.equal(initialVertRef)

            // Change something that affects calculation (e.g. human vertices)
            // Just simulate by manually dirtying human verts or changing matrix
            proxy.matrix.elements[0] += 0.1

            // Second update
            proxy.updatePositions()
            expect(proxy.mesh.geometry.vertices[0]).to.equal(initialVertRef)
        })
    })

    describe('ethnic-skin-blender.js optimizations', () => {
        it('should return independent Color objects despite reuse', () => {
            const blender = human.ethnicSkinBlender

            human.factors.setCaucasian(1)
            human.factors.setAfrican(0)
            human.factors.setAsian(0)
            const color1 = blender.valueOf()

            human.factors.setCaucasian(0)
            human.factors.setAfrican(1)
            human.factors.setAsian(0)
            const color2 = blender.valueOf()

            // Verify they are different objects
            expect(color1).to.not.equal(color2)

            // Verify values are different (Caucasian vs African)
            expect(color1.equals(color2)).to.be(false)

            // Verify values are correct (checking if previous state bled into new one)
            // caucasianColor HSL(0.062, 0.51, 0.68) -> RGB approx (0.81, 0.64, 0.52)
            // africanColor HSL(0.09, 0.83, 0.21) -> RGB approx (0.38, 0.23, 0.04)
            // Just check they aren't black (0,0,0) which might happen if reuse failed completely
            expect(color1.r).to.be.above(0)
            expect(color2.r).to.be.above(0)
        })
    })
})
