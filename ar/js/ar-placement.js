// AR placement scene — back camera, SLAM world tracking.
// Loads reyperf.glb (~1.7m tall), shows an animated star reticle on the floor,
// and places the model when the user taps.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_HEIGHT_M = 1.7;

export const initArPlacementScene = ({ onPlaced, onHintChange } = {}) => {
  let scene, camera;
  let reyModel     = null;
  let reticleGroup = null;
  let starMesh     = null;
  let glowRing     = null;
  let modelPlaced  = false;
  let animTime     = 0;
  let prevTime     = performance.now();
  const reticlePos = new THREE.Vector3();
  let mixer        = null; // Animation mixer
  let balls        = [];   // Bouncing balls
  let touchStartX  = null; // For rotation gesture

  // ── Load rey.glb, scale to 1.7m, extract balon mesh ───────────────────────
  const loadModel = async () => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const gltf = await loader.loadAsync('../assets/3D/reyperf.glb');
    const model = gltf.scene;

    // Scale to target height (1.7m) then 1.5X multiplier
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // Use the larger of height or size to ensure proper scaling
    const modelSize = Math.max(size.y, size.x, size.z);
    model.scale.setScalar((MODEL_HEIGHT_M / modelSize) * 1.55);

    // Align base at y = 0
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;

    model.visible = false;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow    = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
      }
    });

    // Play animations in loop
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => {
        mixer.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      });
      console.log('Playing', gltf.animations.length, 'animations');
    }

    reyModel = model;
    scene.add(reyModel);
    console.log('reyperf.glb loaded ✓  height =', MODEL_HEIGHT_M, 'm');

    // Extract "balon" mesh for bouncing balls
    let balonMesh = null;
    model.traverse(o => {
      if (o.isMesh && o.name && o.name.toLowerCase() === 'balon') {
        balonMesh = o.clone();
        console.log('Found "balon" mesh');
      }
    });

    // Create bouncing balls around the model
    if (balonMesh) {
      createBouncingBalls(balonMesh);
    }

    dracoLoader.dispose();
  };

  // ── Create bouncing balls around the model ───────────────────────────────
  const createBouncingBalls = (balonMesh) => {
    const numBalls = 6;
    const radius   = 2.5; // distance from center

    for (let i = 0; i < numBalls; i++) {
      const ball = balonMesh.clone();
      const angle = (i / numBalls) * Math.PI * 2;

      // Position in a circle around center
      ball.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      // Scale balls 2X from original mesh size, then 0.9X reduction = 1.8X total
      ball.scale.setScalar(1.8);
      ball.castShadow = false;
      ball.receiveShadow = false;
      ball.frustumCulled = true;

      // Animation properties (higher bounce)
      ball.userData = {
        baseY: 0,
        bounceHeight: 1.0 + Math.random() * 0.4, // Increased to 1.0-1.4m
        bounceSpeed: 2 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2
      };

      ball.visible = false; // Hidden until model placed
      scene.add(ball);
      balls.push(ball);
    }
    console.log('Created', balls.length, 'bouncing balls');
  };

  // ── Star reticle ────────────────────────────────────────────────────────
  const createReticle = () => {
    reticleGroup = new THREE.Group();
    reticleGroup.rotation.x = -Math.PI / 2; // lie flat on floor

    // Star sprite (star.svg as texture)
    const tex = new THREE.TextureLoader().load('assets/im/star.svg');
    tex.colorSpace = THREE.SRGBColorSpace;
    starMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    reticleGroup.add(starMesh);

    // Outer glow ring
    glowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.30, 0.42, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffdd00, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    reticleGroup.add(glowRing);

    // Inner glow ring (smaller, brighter)
    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.20, 0.28, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    reticleGroup.add(innerRing);

    scene.add(reticleGroup);
  };

  // ── Project floor position from camera direction ────────────────────────
  const updateReticle = () => {
    if (modelPlaced || !reticleGroup || !camera) return;

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    // Floor plane: y = camPos.y - 1.4  (estimate: user holds phone ~1.4m above floor)
    const floorY = camPos.y - 1.4;

    if (forward.y < -0.02) {
      const t = (floorY - camPos.y) / forward.y;
      if (t > 0.3 && t < 6) {
        reticlePos.copy(camPos).addScaledVector(forward, t);
        reticlePos.y = floorY;
        reticleGroup.position.set(reticlePos.x, floorY + 0.01, reticlePos.z);
        reticleGroup.visible = true;
        return;
      }
    }
    // Fallback: 1.8m in front on floor plane
    reticlePos.set(
      camPos.x + forward.x * 1.8,
      floorY,
      camPos.z + forward.z * 1.8
    );
    reticleGroup.position.set(reticlePos.x, floorY + 0.01, reticlePos.z);
    reticleGroup.visible = true;
  };

  // ── Reticle animation: pulse + spin + glow ──────────────────────────────
  const animateReticle = (dt) => {
    if (modelPlaced || !reticleGroup) return;
    animTime += dt;

    const pulse = 1 + 0.2 * Math.sin(animTime * 3.5);
    starMesh.scale.setScalar(pulse);
    reticleGroup.rotation.z = animTime * 1.3;

    if (glowRing) {
      glowRing.rotation.z      = -animTime * 0.9;
      glowRing.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(animTime * 4));
    }
  };

  // ── Place model at current reticle position ─────────────────────────────
  const placeModel = () => {
    if (!reyModel || modelPlaced) return;
    modelPlaced = true;

    reyModel.position.copy(reticlePos);
    reyModel.position.y = reticlePos.y - .6; // lower by 0.1m to touch floor

    // Face camera (horizontal only)
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    reyModel.lookAt(camPos.x, reyModel.position.y, camPos.z);

    reyModel.visible     = true;
    reticleGroup.visible = false;

    // Position and show bouncing balls around the rey model
    balls.forEach(ball => {
      // Position ball relative to rey model's position
      const offsetX = ball.position.x; // original X offset from center
      const offsetZ = ball.position.z; // original Z offset from center
      ball.position.set(
        reyModel.position.x + offsetX,
        ball.userData.baseY,
        reyModel.position.z + offsetZ
      );
      ball.visible = true;
    });

    if (onHintChange) onHintChange('¡El Rey está en tu escena!');
    if (onPlaced)     onPlaced();
    // Dispatch event to show photo button and logo
    window.dispatchEvent(new CustomEvent('ar-model-placed'));
    // Fade out the placed hint after 2 seconds (stays hidden until mode switch)
    const hintEl = document.getElementById('hint');
    if (hintEl) {
      setTimeout(() => {
        hintEl.style.opacity = '0';
      }, 2000);
    }
    console.log('reyperf.glb placed at', reticlePos);
  };

  // ── XR scene setup ───────────────────────────────────────────────────────
  const initXrScene = ({ scene: s, camera: c, renderer }) => {
    scene  = s;
    camera = c;

    renderer.outputColorSpace  = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    // Ambient fill
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // Sunlight with shadow
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
    sun.position.set(5, 10, 5);
    sun.castShadow                  = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.near          = 0.1;
    sun.shadow.camera.far           = 40;
    sun.shadow.camera.left          = -6;
    sun.shadow.camera.right         = 6;
    sun.shadow.camera.top           = 8;
    sun.shadow.camera.bottom        = -2;
    sun.shadow.bias                 = -0.0005;
    scene.add(sun);

    // Invisible shadow-catcher ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    ground.rotation.x    = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    loadModel().catch(err => console.error('Error cargando reyperf.glb:', err));
    createReticle();
  };

  return {
    name: 'rey-ar-placement',
    onStart: () => {
      const xr = XR8.Threejs.xrScene();
      initXrScene(xr);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      // Tap the screen to place the model
      document.getElementById('camerafeed').addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          if (!modelPlaced) {
            placeModel();
          } else {
            // Start rotation gesture
            touchStartX = e.touches[0].clientX;
          }
        },
        { passive: false }
      );

      // Handle touch move for rotation
      document.getElementById('camerafeed').addEventListener(
        'touchmove',
        (e) => {
          if (!modelPlaced || touchStartX === null || !reyModel) return;
          e.preventDefault();

          const currentX = e.touches[0].clientX;
          const deltaX = currentX - touchStartX;
          const rotationSensitivity = 0.005;

          // Apply horizontal rotation (yaw)
          reyModel.rotation.y += deltaX * rotationSensitivity;

          touchStartX = currentX;
        },
        { passive: false }
      );

      // Reset touch start on touch end
      document.getElementById('camerafeed').addEventListener(
        'touchend',
        (e) => {
          touchStartX = null;
        }
      );
    },
    onUpdate: () => {
      const now = performance.now();
      const dt  = Math.min((now - prevTime) / 1000, 0.1);
      prevTime  = now;
      updateReticle();
      animateReticle(dt);

      // Update animation mixer for rey model
      if (mixer) {
        mixer.update(dt);
      }

      // Animate bouncing balls
      if (modelPlaced && balls.length > 0) {
        const time = now / 1000;
        balls.forEach(ball => {
          const { baseY, bounceHeight, bounceSpeed, phase } = ball.userData;
          // Sine wave bounce
          ball.position.y = baseY + Math.abs(Math.sin(time * bounceSpeed + phase)) * bounceHeight;
          // Rotate balls slightly for visual interest
          ball.rotation.x += dt * 1.5;
          ball.rotation.z += dt * 1;
        });
      }
    },
  };
};
