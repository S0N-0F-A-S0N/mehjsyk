/**
 * @name            MakeHuman
 * @copyright       MakeHuman Team 2001-2016
 * @license         [AGPL3]{@link http://www.makehuman.org/license.php}
 * @author          wassname
 * @description
 * Classes and functions to hold and manipulate morphTargets
 */

import _ from 'lodash'
import * as THREE from 'three'
import targetList from 'makehuman-data/src/json/targets/target-list.json'
import targetCategories from 'makehuman-data/src/json/targets/target-category-data.json'
import {
    invertByMany
} from '../helpers/helpers'

/**
 * A morphTarget for THREE.Geometry. It represents a target to interpolate the
 * base mesh to. It stores a value which is applied by applied to
 * morphTargetInfluences using target.updateValue.
 */
export class Target {

    constructor(config) {
        this.name = config.path
        this.path = config.path
        this.group = config.group

        this.categories = config.categories
        this.variables = config.variables
        this.macroVariables = config.macroVariables
    }

    getVariables() {
        return _.keys(_.pickBy(this.categories, _.isTrue))
    }

    set value(val) {
        const i = this.parent.human.morphTargetDictionary[this.name]
        this.parent.human.morphTargetInfluences[i] = val
    }

    get value() {
        const i = this.parent.human.morphTargetDictionary[this.name]
        return this.parent.human.morphTargetInfluences[i]
    }
}


/**
 * Contains meta data about all available targets
 */
export class TargetMetaData {
    constructor() {
        const self = this
        this.targetCategories = targetCategories
        this.categoryTargets = _.invertBy(targetCategories)
        this.categories = _.uniq(_.keys(targetCategories))

        this.targetIndex = _.map(_.keys(targetList.targets), path => self.pathToGroupAndCategories(path))
        this.targetImages = targetList.images
        this.targetsByTag = invertByMany(targetList.targets)
        this.targetsUrls = _.keys(targetList.targets)
        this.targetsByPath = _.groupBy(this.targetIndex, i => i.path)
        this.targetGroups = _(this.targetsUrls)
            .map(path => new Target(self.pathToGroupAndCategories(path)))
            .groupBy(gc => gc.group)
            .value()
    }

    pathToGroupAndCategories(origPath) {
        origPath = origPath.toLowerCase()
        const shortPath = origPath.replace(/^.+targets\//, '')
        const path = shortPath.replace(/\.target$/g, '')
        const subgroups = path.replace(/[/_,]/g, '-').split('-')

        const categories = {}
        Object.keys(this.categoryTargets).map(categ => (categories[categ] = null))

        const macroGroup = _.filter(subgroups, group => targetCategories[group])
        macroGroup.forEach((group) => {
            const category = targetCategories[group]
            categories[category] = group
        })

        _.pull(subgroups, ...macroGroup)

        return {
            group: subgroups.join('-'),
            categories,
            variables: _.values(_.pickBy(categories, _.isTrue)).sort(),
            macroVariables: _.keys(_.pickBy(categories, _.isTrue)).sort(),
            path: origPath,
            shortPath
        }
    }

    findTargets(path) {
        if (path === null) {
            return []
        }

        let targetsList

        try {
            targetsList = this.getTargetsByGroup(path) || []
        } catch (exc) {
            console.debug('missing target %s', path)
            targetsList = []
        }

        const result = []
        for (let i = 0; i < targetsList.length; i += 1) {
            const target = targetsList[i]
            const factordependencies = _.concat(target.variables, [target.group])
            result.push([target.path, factordependencies])
        }
        return result
    }

    getTargetsByGroup(group) {
        if (!group) return []
        group = this.pathToGroupAndCategories(group).group
        return this.targetGroups[group]
    }

}

export class Targets extends TargetMetaData {
    constructor(human) {
        super()
        this.human = human

        this.lastBake = new Date().getTime()

        // targets are stored here
        this.children = {}

        this.loading = false

        // for loading
        this.manager = new THREE.LoadingManager()
        this.bufferLoader = new THREE.FileLoader(this.manager)
        this.bufferLoader.setResponseType('arraybuffer')
    }

    /**
     * load all from a single file describing sparse data
     * @param  {String} url  - url to bin file containing Int16 array
     *                       nb_targets*nb_vertices*3 in length
     * @return {Promise}     promise of an array of targets
     */
    load(dataUrl = 'data/targets/targets.bin') {
        const self = this
        this.loading = true

        const targets = []

        // Ensure we have access to the position attribute
        const positionAttribute = this.human.mesh.geometry.getAttribute('position')

        // Cache initial positions for morphing
        this.referencePositions = new Float32Array(positionAttribute.array)

        const paths = this.targetIndex.map(t => t.path)
        paths.sort()
        this.human.morphTargetDictionary = paths.reduce((a, p, i) => { a[p] = i; return a }, {})
        this.targetIndex.map(t => t.path).map((path) => {
            const config = self.pathToGroupAndCategories(path)
            const target = new Target(config)
            targets.push(target)
            target.parent = self
            self.children[target.name] = target
            return target
        })

        self.human.morphTargetInfluences = new Float32Array(paths.length)

        return new Promise((resolve, reject) => self.bufferLoader.load(dataUrl, resolve, undefined, reject))
        .then((data) => {
            self.targetData = new Int16Array(data)

            const vertexCount = positionAttribute.count;
            const loadedTargets = self.human.targets.targetData.length / 3 / vertexCount

            console.assert(
                self.targetData.length % (3 * vertexCount) === 0,
                'targets should be a multiple of nb_vertices*3'
            )
            console.debug(
                'loaded targets',
                loadedTargets
            )
            self.loading = false
            return self.targetData
        })
        .catch((err) => {
            self.loading = false
            throw (err)
        })
    }


    /**
     * Updated vertices from applied targets. Should be called on render since it
     * will only run if it's needed and more than a second has passed
     */
    applyTargets() {
        // skip if it hasn't been rendered
        if (!this.human ||
            !this.human.mesh ||
            !this.human.mesh.geometry ||
            !this.targetData
        ) return false

        // skip if less than a second since last
        if ((new Date().getTime() - this.lastBake) < this.human.minUpdateInterval) return false

        // check if it'schanged
        if (_.isEqual(this.lastmorphTargetInfluences, this.human.morphTargetInfluences)) return false

        const positionAttribute = this.human.mesh.geometry.getAttribute('position')
        const vertexCount = positionAttribute.count
        const m = vertexCount * 3
        const n = this.human.morphTargetInfluences.length

        // Optimization: Use a typed array for accumulation to avoid garbage
        if (!this._dVert || this._dVert.length !== m) {
             this._dVert = new Float32Array(m);
        } else {
             this._dVert.fill(0);
        }
        const dVert = this._dVert;

        console.assert(this.targetData.length === m * n, `target data should be nb_targets*nb_vertices*3: ${m * n}`)

        // This loop is the bottleneck for morphing
        // Bolt says: Optimize loop!

        // TODO: This N*M loop is very heavy in JS.
        // 1. Identify active influences first to skip inner loops.
        // 2. Transpose data if possible (unlikely here as it is binary blob).

        const activeInfluences = [];
        for (let j = 0; j < n; j++) {
            const influence = this.human.morphTargetInfluences[j];
            if (influence !== 0) {
                activeInfluences.push({ index: j, value: influence });
            }
        }

        if (activeInfluences.length === 0) return false;

        // do the dot product over a flat targetData
        for (let k = 0; k < activeInfluences.length; k++) {
            const { index: j, value: influence } = activeInfluences[k];
            const offset = j * m;

            // Check optimization: Maybe unroll loop or block processing?
            // JS engines optimize simple loops well.
            for (let i = 0; i < m; i++) {
                const val = this.targetData[i + offset];
                if (val !== 0) {
                    dVert[i] += val * influence
                }
            }
        }

        // update the vertices
        // We read from referencePositions (initial state) and apply dVert
        const positions = positionAttribute.array;
        const refs = this.referencePositions;

        for (let i = 0; i < m; i++) {
            positions[i] = refs[i] + dVert[i] * 1e-3
        }

        positionAttribute.needsUpdate = true;
        // this.human.mesh.geometry.elementsNeedUpdate = true // BufferGeometry doesn't need this

        // Cache the last influences to avoid re-computing if nothing changed
        this.lastmorphTargetInfluences = new Float32Array(this.human.morphTargetInfluences)
        this.lastBake = new Date().getTime()

        return true
    }
}

export const targetMetaData = new TargetMetaData()
export default Targets
