import * as THREE from 'three';
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

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
  scene.add(hemi);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5566ff, roughness: 0.4, metalness: 0.1 });
  const cube = new THREE.Mesh(geo, mat);
  scene.add(cube);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Tone.js organ
  const organ = await createOrgan('./assets/');
  bindGermanKeyboard(organ);

  // Simple pulse on keydown effect (optional): flash cube color
  let flashT = 0;
  window.addEventListener('keydown', () => { flashT = 0.08; });

  const clock = new THREE.Clock();
  function tick() {
    const dt = clock.getDelta();
    cube.rotation.y += dt * 0.6;
    cube.rotation.x += dt * 0.2;

    if (flashT > 0) {
      flashT -= dt;
      mat.emissive.setHex(0x222255);
    } else {
      mat.emissive.setHex(0x000000);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

main().catch((err) => console.error(err));
