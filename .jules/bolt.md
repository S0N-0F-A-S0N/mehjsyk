## 2024-05-23 - Initial Analysis
**Learning:** The codebase relies heavily on `THREE.js` (legacy version approx 0.82) and performs heavy vertex manipulation on the CPU.
**Action:** Focus on reducing object instantiation (Vector3, Matrix3, Arrays) in the render/update loops (`applyTargets`, `updatePositions`) to reduce Garbage Collection pauses.
