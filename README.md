# makehuman-js ⚡ Bolt Edition

A high-performance library that builds human models in the browser using Three.js.

![Bolt Optimized](https://img.shields.io/badge/Performance-Optimized-lightning.svg)

A live demo (NSFW while loading) is available at [mhwebui.wassname.com](http://mhwebui.wassname.com/)

An an example of how to use this library is in the [example repository](https://github.com/makehuman-js/makehuman-js-example).

![](docs/images/ui-screenshot.png)

# Status

This is a alpha product, recently modernized for Three.js r182+.

# Usage with CDN (Modern)

You can use `makehuman-js` directly in the browser using an Import Map.

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.min.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/",
      "makehuman-js": "https://cdn.jsdelivr.net/gh/makehuman-js/makehuman-js@latest/dist/makehuman-js.mjs"
    }
  }
</script>

<script type="module">
  import * as THREE from 'three';
  import { Human } from 'makehuman-js';

  // Scene setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Initialize Human
  const human = new Human({
      baseUrl: 'path/to/makehuman-data/'
  });

  human.loadModel().then(() => {
      scene.add(human);

      function animate() {
          requestAnimationFrame(animate);
          renderer.render(scene, camera);
      }
      animate();
  });
</script>
```

# Performance Optimizations (Bolt)

This version includes significant performance improvements:
*   **Zero-Allocation Joint Updates**: Skeletal updates now read directly from buffer attributes, removing thousands of Vector3 allocations per frame.
*   **BufferGeometry Migration**: Fully migrated to modern `BufferGeometry` for GPU-efficient rendering and lower memory usage.
*   **Vite Build System**: Modern, fast build tooling producing optimized ESM bundles.

# Tests

- clone
- `npm install`
- `npm run build`
- `node test/verify_build.js`

# Licensing

(This license is for the makehuman-js code, outputs are CC0, the data/models remain under the makehuman project licence)

Copyright 2016-2017 Mike Clark (wassname)

It is open source and free to use as it is licensed under the AGPLv3.
