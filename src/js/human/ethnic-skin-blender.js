/**
 * @name            MakeHuman
 * @copyright       MakeHuman Team 2001-2016
 * @license         [AGPL3]{@link http://www.makehuman.org/license.php}
 * @description     blends three ethnic skin tones
 */
import * as THREE from 'three'
import _ from 'lodash'

// these are set to look right when added to the caucasian skin
const asianColor = new THREE.Color().setHSL(0.078, 0.34, 0.576)
const africanColor = new THREE.Color().setHSL(0.09, 0.83, 0.21)
const caucasianColor = new THREE.Color().setHSL(0.062, 0.51, 0.68)


export class EthnicSkinBlender {
    /**
     * return a blend of the three ethnic skin tones based on the human macro settings.
    **/
    constructor(human) {
        this.human = human
    }

    valueOf() {
        const blends = [
            this.human.factors.getCaucasian(),
            this.human.factors.getAfrican(),
            this.human.factors.getAsian()
        ]

        // BOLT: Optimization - Reuse temporary color to avoid object creation
        if (!this._tempColor) this._tempColor = new THREE.Color()
        const color = this._tempColor.setRGB(0, 0, 0)

        // Reuse a helper color for additions to avoid cloning
        if (!this._helperColor) this._helperColor = new THREE.Color()
        const helper = this._helperColor

        // Set diffuse color
        // caucasian
        helper.copy(caucasianColor).multiplyScalar(blends[0])
        color.add(helper)

        // african
        helper.copy(africanColor).multiplyScalar(blends[1])
        color.add(helper)

        // asian
        helper.copy(asianColor).multiplyScalar(blends[2])
        color.add(helper)

        // clamp to [0,1]
        color.r = _.clamp(color.r, 0, 1)
        color.g = _.clamp(color.g, 0, 1)
        color.b = _.clamp(color.b, 0, 1)

        // Return a new color or clone if needed by consumer?
        // valueOf usually implies returning a primitive or a value that might be used immediately.
        // The original code returned a new THREE.Color object.
        // To be safe and compatible, we should return a new object or clone,
        // BUT if this is called frequently, we might want to return the same object if the consumer supports it.
        // Given 'valueOf' semantics, it's safer to return a new object to avoid side effects if the consumer modifies it.
        // However, the optimization goal is to reduce GC.
        // Let's return a clone for correctness as this likely isn't the tightest loop (skin color update vs vertex update),
        // but we saved 3-4 intermediate Color objects + array maps.

        return color.clone()
    }
}

export default EthnicSkinBlender
