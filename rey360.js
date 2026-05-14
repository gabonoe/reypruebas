import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('rey-canvas');
const hotspotsEl = document.getElementById('hotspots');
const loaderEl = document.getElementById('rey-loader');
const hotspots = Array.from(hotspotsEl.querySelectorAll('.Hotspot'));

// Toggle expanded state en hot-labels
hotspots.forEach((hotspot) => {
  const label = hotspot.querySelector('.hot-label');
  const dot = hotspot.querySelector('.hot-dot');
  const closeBtn = hotspot.querySelector('.hot-close');

  // En móvil: mostrar hot-label al hacer click en hot-dot
  if (dot) {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMobile = window.innerWidth <= 640;
      if (isMobile) {
        // Cerrar otros hot-labels visibles
        document.querySelectorAll('.hot-label.visible').forEach((el) => {
          if (el !== label) el.classList.remove('visible');
        });
        // Toggle current
        label.classList.toggle('visible');
      }
    });
  }

  // Click en hot-label para expandir
  if (label) {
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      // Cerrar otros hot-labels expandidos
      document.querySelectorAll('.hot-label.expanded').forEach((el) => {
        if (el !== label) el.classList.remove('expanded');
      });
      // Toggle current
      label.classList.toggle('expanded');
    });
  }

  // Click en botón X para cerrar hot-label
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      label.classList.remove('visible', 'expanded');
    });
  }
});

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- Scene ---
const scene = new THREE.Scene();
scene.background = null;

// --- Camera ---
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 1.0, 3.8);
let useModelCamera = false; // Flag para saber si usamos cámara del modelo

// --- Audio (HTML5 Audio API) ---
const backgroundMusic = new Audio('assets/sound/latinB.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.5;
backgroundMusic.preload = 'auto';

function playBackgroundMusic() {
  if (backgroundMusic.paused) {
    backgroundMusic.play().then(() => {
      console.log('[Rey360] Música iniciada: latinB.mp3');
      updateMusicButton();
    }).catch((err) => {
      console.warn('[Rey360] No se pudo reproducir audio:', err);
    });
  }
}

function stopBackgroundMusic() {
  if (!backgroundMusic.paused) {
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    updateMusicButton();
  }
}

function updateMusicButton() {
  const musicBtn = document.getElementById('btn-music');
  if (musicBtn) {
    if (backgroundMusic.paused) {
      musicBtn.classList.remove('audio-on');
      musicBtn.classList.add('audio-off');
    } else {
      musicBtn.classList.remove('audio-off');
      musicBtn.classList.add('audio-on');
    }
  }
}

// Page Visibility API - pausar/reanudar audio al cambiar de pestaña/aplicación
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!backgroundMusic.paused) {
      backgroundMusic.pause();
      console.log('[Rey360] Música pausada (página oculta)');
    }
  } else {
    // Solo reanudar si estamos en la pantalla de rey360
    const rey360Section = document.getElementById('rey360');
    if (rey360Section && rey360Section.classList.contains('active')) {
      backgroundMusic.play().then(() => {
        console.log('[Rey360] Música reanudada (página visible)');
        updateMusicButton();
      }).catch((err) => {
        console.warn('[Rey360] No se pudo reanudar audio:', err);
      });
    }
  }
});

// Detectar cambio de pantalla en la aplicación
function onScreenChange() {
  const rey360Section = document.getElementById('rey360');
  if (rey360Section && rey360Section.classList.contains('active')) {
    // Entró a rey360 - intentar reproducir audio
    playBackgroundMusic();
  } else {
    // Salió de rey360 - detener audio
    stopBackgroundMusic();
  }
}

// Observar cambios de pantalla usando MutationObserver
const screenObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      onScreenChange();
    }
  });
});

// Observar todas las pantallas
document.querySelectorAll('.screen').forEach((screen) => {
  screenObserver.observe(screen, { attributes: true, attributeFilter: ['class'] });
});

// Los navegadores requieren interacción del usuario para reproducir audio
// La música se iniciará después del primer click/toque en el canvas
canvas.addEventListener('click', playBackgroundMusic, { once: true });
canvas.addEventListener('touchstart', playBackgroundMusic, { once: true });

// Botón de música (pausar/reanudar)
const musicBtn = document.getElementById('btn-music');
if (musicBtn) {
  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (backgroundMusic.paused) {
      backgroundMusic.play().then(() => {
        console.log('[Rey360] Música reanudada manualmente');
        updateMusicButton();
      });
    } else {
      backgroundMusic.pause();
      console.log('[Rey360] Música pausada manualmente');
      updateMusicButton();
    }
  });
}

console.log('[Rey360] Audio cargado: assets/sound/latinB.mp3');

// --- Controls ---
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.0, 0);
controls.minDistance = 1.8;
controls.maxDistance = 6;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI - 0.2;

// --- Auto-rotación (estilo model-viewer) ---
// Rota cuando no hay interacción por 2 segundos
let isUserInteracting = false;
let autoRotateTimeout = null;
const AUTO_ROTATE_DELAY = 2000; // 2 segundos de inactividad

function enableAutoRotate() {
  if (!isUserInteracting && modelRoot) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0; // velocidad moderada
    document.body.classList.add('model-autorotating');
  }
}

function disableAutoRotate() {
  controls.autoRotate = false;
  document.body.classList.remove('model-autorotating');
}

function onUserInteractionStart() {
  isUserInteracting = true;
  disableAutoRotate();
  if (autoRotateTimeout) {
    clearTimeout(autoRotateTimeout);
    autoRotateTimeout = null;
  }
}

function onUserInteractionEnd() {
  isUserInteracting = false;
  if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
  autoRotateTimeout = setTimeout(enableAutoRotate, AUTO_ROTATE_DELAY);
}

// Eventos de interacción
canvas.addEventListener('mousedown', onUserInteractionStart);
canvas.addEventListener('touchstart', onUserInteractionStart, { passive: true });
window.addEventListener('mouseup', onUserInteractionEnd);
window.addEventListener('touchend', onUserInteractionEnd);
canvas.addEventListener('wheel', () => {
  onUserInteractionStart();
  setTimeout(onUserInteractionEnd, 500);
}, { passive: true });

// --- Lights ---
// Ambiente al 50% (baja)
const ambient = new THREE.AmbientLight(0xbfe5dc, 0.18);
scene.add(ambient);

// Luz OMNI (point light) principal: proyecta sombra sobre el modelo
const omni = new THREE.PointLight(0xfff0dc, 35, 15, 1.8);
omni.position.set(-1, 4, 1.8);
omni.castShadow = true;
omni.shadow.mapSize.set(1024, 1024);
omni.shadow.bias = -0.002;
omni.shadow.normalBias = 0.02;
omni.shadow.radius = 6;        // suavizado (PCFSoft)
omni.shadow.camera.near = 0.1;
omni.shadow.camera.far = 15;
scene.add(omni);

// Fill muy suave opuesto para evitar negros totales
const fill = new THREE.PointLight(0x2a6b80, 4, 12, 2);
fill.position.set(-1.8, 1.6, -1.2);
scene.add(fill);

// Piso receptor de sombras
const groundMat = new THREE.ShadowMaterial({ opacity: 0.55 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// --- Environment (RoomEnvironment - generado localmente, sin CORS) ---
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
const envMap = pmrem.fromScene(roomEnv).texture;
scene.environment = envMap;
roomEnv.dispose();
pmrem.dispose();
console.log('[Rey360] Environment map cargado (RoomEnvironment)');

// --- Cargar modelo ---
let mixer = null;
let modelRoot = null;
const hotspotAnchors = [];

// Configurar Draco loader para modelos comprimidos
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
dracoLoader.setDecoderConfig({ type: 'js' });

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.load(
  'assets/3D/reyperf.glb',
  (gltf) => {
    modelRoot = gltf.scene;
    scene.add(modelRoot);

    // Buscar cámara predefinida en el archivo GLTF
    if (gltf.cameras && gltf.cameras.length > 0) {
      const modelCamera = gltf.cameras[0];
      // Usar la cámara del modelo
      camera.copy(modelCamera);
      useModelCamera = true;
      console.log('[Rey360] Usando cámara predefinida del modelo:', modelCamera);
    }

    // Sombras y ajustes de material
    modelRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => {
            // Mesh "Cylinder" → metálico reflectivo
            const isCyl = /cylinder/i.test(obj.name || '') || /cylinder/i.test(mat.name || '');
            if (isCyl && mat.isMeshStandardMaterial) {
              mat.metalness = 1.0;
              mat.roughness = 0.02;
              mat.envMapIntensity = 2.5;
              mat.needsUpdate = true;
              console.log('[Rey360] Metálico aplicado a mesh:', obj.name, '| material:', mat.name);
            }
            if (mat.isMeshStandardMaterial) {
              mat.envMapIntensity = mat.envMapIntensity ?? 1.0;
            }
          });
        }
      }
    });

    // Animación del GLB
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(modelRoot);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    // Crear anclas 3D para cada hotspot y adjuntar al modelo
    hotspots.forEach((el) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(
        parseFloat(el.dataset.x),
        parseFloat(el.dataset.y),
        parseFloat(el.dataset.z)
      );
      modelRoot.add(anchor);
      hotspotAnchors.push({ el, anchor });
    });

    // Auto-encuadre vertical según altura del modelo
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    controls.target.set(0, center.y, 0);

    // Ajustar distancia de cámara para móvil (solo si no usamos cámara del modelo)
    if (!useModelCamera) {
      const isMobilePortrait = window.innerWidth <= 640 && window.innerHeight > window.innerWidth;
      const isMobileLandscape = window.innerWidth <= 640 && window.innerHeight <= window.innerWidth;
      let cameraDistance;
      if (isMobileLandscape) {
        cameraDistance = Math.max(2.2, size.y * 1.2); // Más cerca en horizontal
      } else if (isMobilePortrait) {
        cameraDistance = Math.max(3.8, size.y * 2.1); // Más lejos en vertical
      } else {
        cameraDistance = Math.max(3.2, size.y * 1.9); // Normal
      }
      camera.position.set(1, center.y, cameraDistance);
      console.log('[Rey360] Usando cámara ajustada para dispositivo');
    }

    controls.update();

    loaderEl.classList.add('hidden');
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      const pct = (xhr.loaded / xhr.total) * 100;
      // console.log('[Rey360] cargando:', pct.toFixed(0) + '%');
    }
  },
  (err) => {
    console.error('[Rey360] Error cargando GLB:', err);
    loaderEl.querySelector('p').textContent = 'Error cargando modelo';
  }
);

// --- Resize ---
function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
// Resize cuando la sección se haga visible (display:flex pasa de none)
const resizeObs = new ResizeObserver(resize);
resizeObs.observe(canvas.parentElement);

// --- Loop ---
const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();
const camForward = new THREE.Vector3();
const toAnchor = new THREE.Vector3();

function updateHotspots() {
  if (!modelRoot || hotspotAnchors.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  camera.getWorldDirection(camForward);

  hotspotAnchors.forEach(({ el, anchor }) => {
    anchor.getWorldPosition(tmpVec);
    // Vector de cámara al ancla
    toAnchor.copy(tmpVec).sub(camera.position).normalize();
    const facing = toAnchor.dot(camForward); // >0 si está delante de cámara

    // Ocultar si está detrás del modelo (z normal respecto cámara)
    // Usamos dirección desde centro del modelo al ancla y comparamos con cámara→centro
    const modelCenter = controls.target;
    const outward = tmpVec.clone().sub(modelCenter).normalize();
    const camDir = modelCenter.clone().sub(camera.position).normalize();
    const behind = outward.dot(camDir) > 0.25; // mira hacia dentro → del otro lado

    // Proyectar a pantalla
    tmpVec.project(camera);
    const x = (tmpVec.x * 0.5 + 0.5) * rect.width;
    const y = (-tmpVec.y * 0.5 + 0.5) * rect.height;

    if (facing > 0 && !behind) {
      el.dataset.visible = 'true';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    } else {
      el.dataset.visible = 'false';
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
  updateHotspots();
}

resize();
animate();

// Iniciar auto-rotación después de carga inicial
setTimeout(enableAutoRotate, AUTO_ROTATE_DELAY + 1000);
