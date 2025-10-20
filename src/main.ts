import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createOrgan } from './audio/organ';
import { bindGermanKeyboard } from './input/organKeyboard';

async function main() {
  // Three.js scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101012);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(2.5, 2, 3.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);

  // Orbit camera controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 12;
  controls.target.set(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(3, 5, 2);
  scene.add(dir);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Tone.js organ
  const organ = await createOrgan('./assets/');

  // ---- GLB + key animation wiring ----
  const loader = new GLTFLoader();
  // Try common locations: root assets, bundled src/models, public root
  const candidateUrls = [
    '/assets/organ.glb',
    new URL('./models/organ.glb', import.meta.url).href,
    '/organ.glb',
    './assets/organ.glb',
    './organ.glb'
  ];
  let gltf: any = null;
  let lastErr: any = null;
  for (const u of candidateUrls) {
    try {
      gltf = await loader.loadAsync(u);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  // Build MIDI lists (used both for mapping and fallback geometry)
  const LOW_MIDI = 48; // C3
  const NUM_NOTES = 36; // 3 octaves
  const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  const whiteMidi: number[] = [];
  const blackMidi: number[] = [];
  for (let m = LOW_MIDI; m < LOW_MIDI + NUM_NOTES; m++) {
    (isBlack(m) ? blackMidi : whiteMidi).push(m);
  }

  let organRoot: THREE.Object3D;
  if (gltf && gltf.scene) {
    organRoot = gltf.scene as THREE.Object3D;
  } else {
    console.warn('organ.glb not found. Building fallback procedural keys so you can continue.');
    organRoot = buildFallbackOrgan(whiteMidi, blackMidi);
  }
  scene.add(organRoot);
  // Fit camera to the organ and center controls target
  try {
    const box = new THREE.Box3().setFromObject(organRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    controls.target.copy(center);
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitDist = maxSize / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
    const dir = new THREE.Vector3(0.4, 0.5, 1).normalize();
    camera.position.copy(center.clone().add(dir.multiplyScalar(fitDist * 1.4)));
    camera.lookAt(center);
    controls.update();
  } catch {}

  // Build name -> object index for fast lookups
  const objectByName = new Map<string, THREE.Object3D>();
  organRoot.traverse((obj: THREE.Object3D) => {
    if (obj.name) objectByName.set(obj.name, obj);
  });

  // Build MIDI -> object map using the provided naming scheme, tolerant to missing/variant names
  const midiToObject = new Map<number, THREE.Object3D>();
  const allNames = Array.from(objectByName.keys());
  const findKeyById = (id: number): THREE.Object3D | undefined => {
    const exact = objectByName.get(`Orgue_GrosTube.${id}`);
    if (exact) return exact;
    const rx = new RegExp(`^Orgue[_\\s-]?GrosTube\\.?0*${id}(?:\\b|\\D|$)`, 'i');
    for (const n of allNames) {
      if (rx.test(n)) return objectByName.get(n);
    }
    return undefined;
  };

  let mapped = 0;
  for (let i = 0; i < whiteMidi.length; i++) {
    const obj = findKeyById(124 + i);
    if (obj) { midiToObject.set(whiteMidi[i], obj); mapped++; }
  }
  for (let i = 0; i < blackMidi.length; i++) {
    const obj = findKeyById(177 + i);
    if (obj) { midiToObject.set(blackMidi[i], obj); mapped++; }
  }
  if (mapped === 0) {
    console.warn('No key meshes matched expected names. Ensure names like Orgue_GrosTube.124..144 and 177..191. Found example names:', allNames.slice(0, 20));
  } else {
    console.info(`Mapped ${mapped} key meshes to MIDI notes.`);
  }

  // Track per-object rotation state
  type AxisKey = 'x' | 'y' | 'z';
  type PerObjectState = { base: { x: number; y: number; z: number }; axis: AxisKey; current: number; target: number };
  const perObject = new Map<THREE.Object3D, PerObjectState>();

  function chooseHingeAxisForPivot(pivot: THREE.Object3D): AxisKey {
    // Find first mesh child to infer dimensions
    let meshChild: THREE.Mesh | null = null;
    pivot.traverse((child: THREE.Object3D) => {
      const anyChild = child as any;
      if (!meshChild && anyChild && anyChild.isMesh) {
        meshChild = anyChild as THREE.Mesh;
      }
    });
    if (!meshChild) return 'x';
    const geom: any = (meshChild as any).geometry;
    if (!geom) return 'x';
    if (!geom.boundingBox) {
      geom.computeBoundingBox?.();
    }
    const bb = geom.boundingBox as THREE.Box3 | null;
    if (!bb) return 'x';
    const size = new THREE.Vector3();
    bb.getSize(size);
    const sx = Math.abs((meshChild as any).scale?.x ?? 1);
    const sz = Math.abs((meshChild as any).scale?.z ?? 1);
    const lenX = size.x * sx;
    const lenZ = size.z * sz;
    // Choose hinge perpendicular to the longest horizontal dimension (prefer X/Z only)
    return lenX >= lenZ ? 'z' : 'x';
  }

  midiToObject.forEach((obj) => {
    const axis = chooseHingeAxisForPivot(obj);
    perObject.set(obj, { base: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, axis, current: 0, target: 0 });
  });

  // Key press/release handlers to tilt keys around local X
  const PRESS_ANGLE = 0.07; // halved tilt; positive tilts down given current axes
  const onDown = (_note: string, midi: number) => {
    const obj = midiToObject.get(midi);
    if (!obj) return;
    const st = perObject.get(obj);
    if (!st) return;
    st.target = PRESS_ANGLE;
  };
  const onUp = (_note: string, midi: number) => {
    const obj = midiToObject.get(midi);
    if (!obj) return;
    const st = perObject.get(obj);
    if (!st) return;
    st.target = 0;
  };

  bindGermanKeyboard(organ, onDown, onUp);

  const clock = new THREE.Clock();
  function tick() {
    const dt = clock.getDelta();

    // Smooth rotate keys toward targets
    const speed = 16; // responsiveness
    perObject.forEach((st: PerObjectState, obj: THREE.Object3D) => {
      st.current += (st.target - st.current) * Math.min(1, speed * dt);
      const axis = st.axis;
      if (axis === 'x') obj.rotation.x = st.base.x + st.current;
      else if (axis === 'y') obj.rotation.y = st.base.y + st.current;
      else obj.rotation.z = st.base.z + st.current;
    });

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

main().catch((err) => console.error(err));

// Build a minimal keyboard if the GLB is missing so development can continue
function buildFallbackOrgan(whiteMidi: number[], blackMidi: number[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'OrganFallback';
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.0 });

  // Layout params (rough approximation)
  const whiteW = 0.06;
  const whiteH = 0.015;
  const whiteL = 0.32;
  const blackW = 0.04;
  const blackH = 0.02;
  const blackL = 0.20;

  // Build white key pivots in order
  const whitePivots: THREE.Object3D[] = [];
  for (let i = 0; i < whiteMidi.length; i++) {
    const pivot = new THREE.Group();
    pivot.name = `Orgue_GrosTube.${124 + i}`;
    pivot.position.set(i * (whiteW + 0.002), 0, 0);
    const geo = new THREE.BoxGeometry(whiteW, whiteH, whiteL);
    const mesh = new THREE.Mesh(geo, whiteMat);
    mesh.position.z = -whiteL * 0.5; // place so pivot is near the back edge
    pivot.add(mesh);
    root.add(pivot);
    whitePivots.push(pivot);
  }

  // Helper: for a black midi, compute which white slot it's above
  const isBlackLocal = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  const blackOffsetsBySemitone: Record<number, number> = { 1: 0.5, 3: 1.5, 6: 3.5, 8: 4.5, 10: 5.5 };
  let whiteCursor = 0;
  for (let m = 48; m < 48 + 36; m++) {
    if (isBlackLocal(m)) continue;
    whiteCursor++;
  }
  // Place black keys using semitone offset over preceding white
  let bi = 0;
  for (let m = 48; m < 48 + 36; m++) {
    if (!isBlackLocal(m)) continue;
    const semitone = m % 12;
    // Count number of white keys before this midi
    let whitesBefore = 0;
    for (let k = 48; k < m; k++) if (!isBlackLocal(k)) whitesBefore++;
    const x = (whitesBefore - 1 + (blackOffsetsBySemitone[semitone] ?? 0.5)) * (whiteW + 0.002);
    const pivot = new THREE.Group();
    pivot.name = `Orgue_GrosTube.${177 + bi}`;
    pivot.position.set(x, blackH * 0.25, 0);
    const geo = new THREE.BoxGeometry(blackW, blackH, blackL);
    const mesh = new THREE.Mesh(geo, blackMat);
    mesh.position.z = -blackL * 0.5;
    pivot.add(mesh);
    root.add(pivot);
    bi++;
  }

  // Slight tilt for realism
  root.rotation.x = -0.1;
  root.position.set(-whitePivots.length * (whiteW + 0.002) * 0.5, -0.1, 0.2);
  return root;
}
