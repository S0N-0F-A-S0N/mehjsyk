
import { Human } from '../dist/makehuman-js.mjs';
import * as THREE from 'three';

console.log('Loading Human...');
try {
    const human = new Human({
        baseUrl: 'node_modules/makehuman-data/public/data/'
    });
    console.log('Human instantiated successfully.');

    if (human instanceof THREE.Object3D) {
        console.log('Human is a THREE.Object3D.');
    } else {
        console.error('Human is NOT a THREE.Object3D.');
        process.exit(1);
    }

} catch (e) {
    console.error('Failed to instantiate Human:', e);
    process.exit(1);
}
console.log('Verification passed.');
