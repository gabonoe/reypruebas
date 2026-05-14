import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ---------- DOM ----------
const splash = document.getElementById('splash');
const btnStart = document.getElementById('btnStart');
const playerNameInput = document.getElementById('playerName');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const shotNumEl = document.getElementById('shotNum');
const playerNameDisplay = document.getElementById('playerNameDisplay');
const messageEl = document.getElementById('message');

// User name storage
let playerName = 'Jugador';
const instructionsEl = document.getElementById('instructions');
const swipePointerEl = document.getElementById('swipePointer');
const swipePointerLeftEl = document.getElementById('swipePointerLeft');
const swipePointerRightEl = document.getElementById('swipePointerRight');
const bgMusic = document.getElementById('bgMusic');
const ruidoG = document.getElementById('ruidoG');
const silbStart = document.getElementById('silbStart');
const silbEnd = document.getElementById('silbEnd');
const kickSound = document.getElementById('kickSound');
const golSound = document.getElementById('golSound');
const abuSound = document.getElementById('abuSound');
const endScreen = document.getElementById('endScreen');
const endPlayerName = document.getElementById('endPlayerName');
const endTitle = document.getElementById('endTitle');
const endScoreEl = document.getElementById('endScore');
const endWinImage = document.getElementById('endWinImage');
const endLoseImage = document.getElementById('endLoseImage');
const endLoseMessage = document.getElementById('endLoseMessage');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnRestart = document.getElementById('btnRestart');
const btnHome = document.getElementById('btnHome');
const btnAudio = document.getElementById('btnAudio');
const btnExit = document.getElementById('btnExit');
const loading = document.getElementById('loading');
const canvas = document.getElementById('game');
const confettiCanvas = document.getElementById('confetti');
const confettiCtx = confettiCanvas.getContext('2d');

// ---------- THREE Setup ----------
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Higher pixel ratio for better rendering quality during zoom
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

let camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 6);
camera.lookAt(0, 1.5, 0);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x99aa88, .8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(-5, 8, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0001;
sun.shadow.normalBias = 0.05;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
scene.add(sun);

// ---------- State ----------
const state = {
  loaded: false,
  playing: false,
  shots: 0,
  goals: 0,
  maxShots: 10,
  goalThreshold: 6,
  ballMoving: false,
  awaitingResult: false,
  ballVelocity: new THREE.Vector3(),
  ballStart: new THREE.Vector3(),
  ballRestPos: new THREE.Vector3(),
  ballRestQuat: new THREE.Quaternion(),
  goalBox: null,
  goalPlaneZ: null,
  goalDir: 1,
  groundY: 0,
  gravity: 9.8,
};

let stadium, player, ballMesh, redMesh, pisoMesh, marcoMesh;
let marcoTriangles = []; // Array of {a, b, c, normal} in world space
let playerMixer, playerAction;
let stadiumMixer = null;
let stadiumGenteAction = null;
let stadiumCameraAction = null;
let stadiumCamera = null;
let ballRadius = 0.12;

// Goalkeeper (rey)
let rey = null;
let reyMixer = null;
let reyIdleAction = null;
let reyDiveActions = []; // array of { action, category }
let reyUsedAnimations = []; // track used animations to prevent repetition
let reyCurrentDive = null;
let reyDiveIndex = 0;
let reyArribaCooldown = 0; // cooldown counter for "arriba" animation
let reySkeleton = null; // primary skeleton for bone-based collision
let reyBoneRadius = 0.18; // collision radius per bone (m)

// Camera shake
const camShake = {
  base: new THREE.Vector3(),  // base camera position captured at start
  hasBase: false,
  time: 0,                    // remaining time (s)
  duration: 0.45,             // total shake duration
  amplitude: 0.06,            // peak displacement (world units)
  seed: Math.random() * 1000,
};

// Camera zoom for goal shots
const camZoom = {
  baseFov: null,              // original FOV captured on first use
  currentFov: null,           // current FOV
  targetFov: null,            // target FOV to lerp toward
  zoomFactor: 0.80,           // 80% of base FOV (20% closer)
  baseY: null,                // original camera Y captured on first use
  currentY: null,             // current Y
  targetY: null,              // target Y to lerp toward
  yOffset: 0.4,               // amount to raise the camera when zoomed
  speed: 3,                   // lerp speed (per second)
};

// Confetti system
const confetti = {
  particles: [],
  active: false,
  colors: ['#094db8', '#73a9ff'],
  spawnCount: 150,
};

// Player fade system
const playerFade = {
  opacity: 0,
  targetOpacity: 0,
  active: false,
  duration: 1.0,
  time: 0,
  meshes: [],
  originalPositions: [], // Store original positions for restoration
};

// Ball fade system
const ballFade = {
  opacity: 0,
  targetOpacity: 0,
  active: false,
  duration: 0.3,
  time: 0,
  mesh: null,
};

// Net cloth simulation
let netGeom = null;
let netPosAttr = null;
let netOriginalPositions = null; // Float32Array snapshot of rest pose
let netVertexWeights = null; // Float32Array of vertex weights (0=fixed edge, 1=fully movable)
let netInvWorldMatrix = new THREE.Matrix4();
let netInvWorldQuat = new THREE.Quaternion();
let netWorldScaleAvg = 1;
let netRefSize = 1; // characteristic size for falloff radius
const netImpact = {
  active: false,         // ball currently in contact
  releasing: false,      // ball left contact, springing back
  t: 0,                  // time since release
  localPoint: new THREE.Vector3(), // impact center in net local space
  localDir: new THREE.Vector3(),   // push direction in net local space (unit)
  strength: 0,           // current displacement amplitude (local units)
  peakStrength: 0,       // captured at release for spring-back
};
const clock = new THREE.Clock();

// ---------- Loaders ----------
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
loader.setDRACOLoader(dracoLoader);
function loadGLTF(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

async function loadAssets() {
  // Load assets sequentially for mobile to prevent freezing
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let stadiumGltf, playerGltf;

  if (isMobile) {
    // Sequential loading for mobile
    stadiumGltf = await loadGLTF('assets/3D/estadio.glb');
    playerGltf = await loadGLTF('assets/3D/player.glb');
  } else {
    // Parallel loading for desktop
    [stadiumGltf, playerGltf] = await Promise.all([
      loadGLTF('assets/3D/estadio.glb'),
      loadGLTF('assets/3D/player.glb'),
    ]);
  }

  // Stadium
  stadium = stadiumGltf.scene;
  scene.add(stadium);

  // Setup stadium animations - find 'gente' clip
  if (stadiumGltf.animations && stadiumGltf.animations.length) {
    stadiumMixer = new THREE.AnimationMixer(stadium);
    const genteClip = stadiumGltf.animations.find(c => /gente/i.test(c.name));
    if (genteClip) {
      stadiumGenteAction = stadiumMixer.clipAction(genteClip);
      stadiumGenteAction.setLoop(THREE.LoopRepeat, Infinity);
      stadiumGenteAction.clampWhenFinished = false;
      // Play very slowly for stadium camera
      stadiumGenteAction.timeScale = 0.05;
      stadiumGenteAction.play();
    }
    // Setup CameraAnim clip (targets the 'Camera' object)
    const cameraClip = stadiumGltf.animations.find(c => /CameraAnim/i.test(c.name));
    if (cameraClip) {
      stadiumCameraAction = stadiumMixer.clipAction(cameraClip);
      stadiumCameraAction.setLoop(THREE.LoopOnce, 1);
      stadiumCameraAction.clampWhenFinished = true;
    }
  }
  stadium.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Ensure material supports shadows
      if (o.material) {
        o.material.needsUpdate = true;
        // Force shadow support on materials
        if (Array.isArray(o.material)) {
          o.material.forEach(m => {
            m.shadowSide = THREE.FrontSide;
          });
        } else {
          o.material.shadowSide = THREE.FrontSide;
        }
      }
    }
    // Find embedded camera
    if (o.isCamera) {
      stadiumCamera = o;
    }
  });

  // Find ball mesh by name (search "balon" in any case)
  stadium.traverse(o => {
    const n = (o.name || '').toLowerCase();
    if (!ballMesh && (n === 'balon' || n.includes('balon') || n.includes('ball'))) {
      if (o.isMesh || o.isObject3D) ballMesh = o;
    }
  });

  // Setup ball fade system
  if (ballMesh && ballMesh.isMesh) {
    ballFade.mesh = ballMesh;
    ballMesh.material.transparent = true;
    ballMesh.material.opacity = 0; // Start invisible
    ballMesh.castShadow = false; // No shadow while fading
  }

  // Use stadium-embedded camera if found
  if (stadiumCamera && stadiumCamera.isCamera) {
    stadiumCamera.aspect = window.innerWidth / window.innerHeight;
    stadiumCamera.updateProjectionMatrix();
    camera = stadiumCamera;
  }

  // Find colliders red, piso and marco
  redMesh = null; pisoMesh = null; marcoMesh = null;
  stadium.traverse(o => {
    const n = (o.name || '').toLowerCase();
    if (!redMesh && n.includes('red')) redMesh = o;
    if (!pisoMesh && (n.includes('piso') || n.includes('floor') || n.includes('ground'))) pisoMesh = o;
    if (!marcoMesh && n.includes('marco')) marcoMesh = o;
  });

  // Build triangle list from marco mesh in world space
  if (marcoMesh && marcoMesh.isMesh && marcoMesh.geometry) {
    marcoMesh.updateWorldMatrix(true, true);
    const geom = marcoMesh.geometry;
    const posAttr = geom.attributes.position;
    const indexAttr = geom.index;
    const matrix = marcoMesh.matrixWorld;
    marcoTriangles = [];
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
    for (let i = 0; i < triCount; i++) {
      let ia, ib, ic;
      if (indexAttr) {
        ia = indexAttr.getX(i * 3);
        ib = indexAttr.getX(i * 3 + 1);
        ic = indexAttr.getX(i * 3 + 2);
      } else {
        ia = i * 3; ib = i * 3 + 1; ic = i * 3 + 2;
      }
      va.fromBufferAttribute(posAttr, ia).applyMatrix4(matrix);
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(matrix);
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(matrix);
      const normal = new THREE.Vector3();
      new THREE.Triangle(va, vb, vc).getNormal(normal);
      marcoTriangles.push({
        a: va.clone(), b: vb.clone(), c: vc.clone(), normal: normal.clone()
      });
    }
  }

  if (redMesh) {
    redMesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(redMesh);
    state.goalBox = box;

    // Prepare cloth simulation on the net mesh
    if (redMesh.isMesh && redMesh.geometry && redMesh.geometry.attributes.position) {
      // Ensure geometry is unique (not shared) so we don't deform other instances
      redMesh.geometry = redMesh.geometry.clone();
      netGeom = redMesh.geometry;
      netPosAttr = netGeom.attributes.position;
      netOriginalPositions = new Float32Array(netPosAttr.array);
      
      // Calculate vertex weights based on distance from edges
      netVertexWeights = new Float32Array(netPosAttr.count);
      const orig = netOriginalPositions;
      const count = netPosAttr.count;
      
      // Find boundaries
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        minX = Math.min(minX, orig[i3]);
        maxX = Math.max(maxX, orig[i3]);
        minY = Math.min(minY, orig[i3 + 1]);
        maxY = Math.max(maxY, orig[i3 + 1]);
        minZ = Math.min(minZ, orig[i3 + 2]);
        maxZ = Math.max(maxZ, orig[i3 + 2]);
      }
      
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const rangeZ = maxZ - minZ;
      const edgeWidth = 0.05; // Percentage of edge to be fixed
      
      // Calculate weights: 0 at edges, 1 in center
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = orig[i3];
        const y = orig[i3 + 1];
        const z = orig[i3 + 2];
        
        // Normalized position from edges (0 at edge, 1 at opposite edge)
        const nx = (x - minX) / rangeX;
        const ny = (y - minY) / rangeY;
        const nz = (z - minZ) / rangeZ;
        
        // Distance from nearest edge (0 at edge, 0.5 at center)
        const dx = Math.min(nx, 1 - nx);
        const dy = Math.min(ny, 1 - ny);
        const dz = Math.min(nz, 1 - nz);
        const minDist = Math.min(dx, dy, dz);
        
        // Weight: 0 if near edge, 1 if in center
        netVertexWeights[i] = Math.min(1, minDist / edgeWidth);
      }
      
      // Make sure it's drawn from both sides since we deform it
      const mats = Array.isArray(redMesh.material) ? redMesh.material : [redMesh.material];
      mats.forEach(m => { if (m) { m.side = THREE.DoubleSide; m.needsUpdate = true; } });
      // Cache transforms
      const ws = redMesh.getWorldScale(new THREE.Vector3());
      netWorldScaleAvg = (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3 || 1;
      const sz = box.getSize(new THREE.Vector3());
      netRefSize = Math.max(sz.x, sz.y, sz.z);
    }
  }
  if (pisoMesh) {
    pisoMesh.updateWorldMatrix(true, true);
    const pBox = new THREE.Box3().setFromObject(pisoMesh);
    state.groundY = pBox.max.y;
  }

  // NOTE: Animation del balon eliminada intencionalmente. El juego controla el balon con fisica.

  // Goalkeeper (rey)
  try {
    const reyGltf = await loadGLTF('assets/3D/rey.glb');
    rey = reyGltf.scene;
    scene.add(rey);
    rey.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Fix shadow artifacts between hat and head by preventing hat from casting shadows
        if (o.name === 'Rsombrero') {
          o.castShadow = false;
        }
      }
    });
    if (reyGltf.animations && reyGltf.animations.length) {
      reyMixer = new THREE.AnimationMixer(rey);
      const idleClip = reyGltf.animations.find(c => /idle/i.test(c.name));
      const otherClips = reyGltf.animations.filter(c => !/idle/i.test(c.name));
      if (idleClip) {
        reyIdleAction = reyMixer.clipAction(idleClip);
        reyIdleAction.setLoop(THREE.LoopRepeat, Infinity);
        reyIdleAction.play();
      }
      reyDiveActions = otherClips.map(c => {
        const a = reyMixer.clipAction(c);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        return { action: a, category: classifyDive(c.name) };
      });
    }
    // Find primary skeleton for bone-based collision (follows the animated pose)
    rey.traverse(o => {
      if (o.isSkinnedMesh && !reySkeleton && o.skeleton && o.skeleton.bones.length) {
        reySkeleton = o.skeleton;
      }
    });
    // Estimate bone radius from rey's overall size
    const reyBox = new THREE.Box3().setFromObject(rey);
    const reySize = reyBox.getSize(new THREE.Vector3());
    reyBoneRadius = Math.max(reySize.x, reySize.z) * 0.16 || 0.18;
  } catch (e) {
    console.warn('No se pudo cargar rey.glb', e);
  }

  // Player
  player = playerGltf.scene;
  scene.add(player);
  // Store original player position
  playerFade.originalPlayerPosition = player.position.clone();
  // Move player outside camera (far below)
  player.position.y = -100;
  player.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Store mesh reference for fade control and enable transparency
      playerFade.meshes.push(o);
      if (o.material) {
        o.material.transparent = true;
        o.material.opacity = 0; // Start invisible
      }
    }
  });
  // Position player relative to ball if needed - assume player.glb is already authored aligned with stadium origin
  if (playerGltf.animations && playerGltf.animations.length) {
    playerMixer = new THREE.AnimationMixer(player);
    let playerClip = playerGltf.animations.find(c => /player|kick|patada/i.test(c.name)) || playerGltf.animations[0];
    playerAction = playerMixer.clipAction(playerClip);
    playerAction.setLoop(THREE.LoopOnce, 1);
    playerAction.clampWhenFinished = true;
  }

  // Save ball rest pose
  if (ballMesh) {
    ballMesh.updateWorldMatrix(true, true);
    state.ballStart.copy(ballMesh.getWorldPosition(new THREE.Vector3()));
    state.ballRestPos.copy(ballMesh.position);
    state.ballRestQuat.copy(ballMesh.quaternion);

    // Estimate ball radius from bounding sphere
    const ballBox = new THREE.Box3().setFromObject(ballMesh);
    const ballSize = ballBox.getSize(new THREE.Vector3());
    ballRadius = Math.max(ballSize.x, ballSize.y, ballSize.z) * 0.5 || 0.12;

    // Determine goal direction based on goalBox center
    if (state.goalBox) {
      const goalCenter = state.goalBox.getCenter(new THREE.Vector3());
      const dir = new THREE.Vector3().subVectors(goalCenter, state.ballStart);
      // Use whichever axis (x or z) has greater magnitude for direction
      if (Math.abs(dir.z) > Math.abs(dir.x)) {
        state.goalAxis = 'z';
        state.goalDir = Math.sign(dir.z) || 1;
        state.goalPlaneZ = state.goalDir > 0 ? state.goalBox.min.z : state.goalBox.max.z;
      } else {
        state.goalAxis = 'x';
        state.goalDir = Math.sign(dir.x) || 1;
        state.goalPlaneZ = state.goalDir > 0 ? state.goalBox.min.x : state.goalBox.max.x;
      }
    }
  }

  state.loaded = true;
}

// ---------- Game flow ----------
function showMessage(text, cls = '', duration = 1200) {
  messageEl.classList.remove('show');
  // Force reflow so the browser resets the transition before showing new message
  void messageEl.offsetWidth;
  messageEl.textContent = text;
  messageEl.className = cls ? cls : '';
  messageEl.classList.add('show');
  if (duration > 0) {
    setTimeout(() => messageEl.classList.remove('show'), duration);
  }
}

function updateHUD() {
  scoreEl.textContent = state.goals;
  shotNumEl.textContent = Math.min(state.shots + 1, state.maxShots);
  playerNameDisplay.textContent = playerName;
}

function resetBall() {
  if (!ballMesh) return;
  ballMesh.position.copy(state.ballRestPos);
  ballMesh.quaternion.copy(state.ballRestQuat);
  ballMesh.updateWorldMatrix(true, true);
  state.ballMoving = false;
  state.awaitingResult = false;
  // Activate slow camera immediately when ball is ready to be kicked again
  if (stadiumGenteAction) {
    stadiumGenteAction.timeScale = 0.05;
  }
  // Restore camera FOV and Y to original
  if (camZoom.baseFov !== null) {
    camZoom.targetFov = camZoom.baseFov;
  }
  if (camZoom.baseY !== null) {
    camZoom.targetY = camZoom.baseY;
  }
  startBallFadeIn();
}

function startGame() {
  // Get user name from input
  const inputName = playerNameInput.value.trim();
  playerName = inputName || 'Jugador';
  
  // Unmute all audios (they may have been muted during loading unlock)
  const allAudiosMute = [bgMusic, ruidoG, silbStart, silbEnd, kickSound, golSound, abuSound];
  allAudiosMute.forEach(audio => { if (audio) audio.muted = false; });
  // Reset all audio elements to ensure they play from start
  // kickSound excluded from load() to avoid decode delay on mobile
  const allAudios = [bgMusic, ruidoG, silbStart, silbEnd, golSound, abuSound];
  allAudios.forEach(audio => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.load();
    }
  });
  if (kickSound) {
    kickSound.pause();
    kickSound.currentTime = 0;
  }
  
  state.shots = 0;
  state.goals = 0;
  state.playing = true;
  updateHUD();
  hud.classList.remove('hidden');
  endScreen.classList.add('hidden');
  splash.classList.add('hidden');
  // Play CameraAnim animation on stadium Camera object (always from start)
  if (stadiumCameraAction) {
    stadiumCameraAction.stop();
    stadiumCameraAction.reset();
    stadiumCameraAction.time = 0;
    stadiumCameraAction.paused = false;
    stadiumCameraAction.enabled = true;
    stadiumCameraAction.play();
    if (stadiumMixer) stadiumMixer.update(0);
  }
  resetBall();
  instructionsEl.classList.remove('hide');
  swipePointerEl.classList.remove('hide');
  swipePointerLeftEl.classList.remove('hide');
  swipePointerRightEl.classList.remove('hide');
  // Reset goalkeeper to idle animation
  returnReyToIdle();

  // Delay audio playback until scene is rendered (longer delay for mobile)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const audioStartDelay = isMobile ? 1500 : 300;

  setTimeout(() => {
    // Play start whistle sound first
    if (silbStart) {
      silbStart.volume = 1.0;
      silbStart.play().catch(e => console.log('SilbStart play failed:', e));
    }
    // Play background music after a short delay
    setTimeout(() => {
      if (bgMusic) {
        bgMusic.volume = .6;
        bgMusic.play().catch(e => console.log('Audio play failed:', e));
      }
      // Play ruidoG audio after music starts
      if (ruidoG) {
        ruidoG.volume = 0.2;
        setTimeout(() => {
          ruidoG.play().catch(e => console.log('RuidoG play failed:', e));
        }, 100);
      }
    }, isMobile ? 400 : 200);
  }, audioStartDelay);
}

function endGame() {
  state.playing = false;
  hud.classList.add('hidden');
  endScreen.classList.remove('hidden');
  // Show player name with result
  endPlayerName.textContent = playerName;
  // Play end whistle sound
  if (silbEnd) {
    silbEnd.volume = 1.0;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      setTimeout(() => silbEnd.play().catch(e => console.log('SilbEnd play failed:', e)), 30);
    } else {
      silbEnd.play().catch(e => console.log('SilbEnd play failed:', e));
    }
  }
  // Stop music and ruidoG immediately
  if (bgMusic) bgMusic.pause();
  if (ruidoG) ruidoG.pause();
  
  if (state.goals >= state.goalThreshold) {
    endTitle.textContent = '¡GANASTE!';
    endTitle.className = 'win';
    endWinImage.classList.remove('hidden');
    endLoseImage.classList.add('hidden');
    endLoseMessage.classList.add('hidden');
    btnScreenshot.classList.remove('hidden');
    spawnEndConfetti();
  } else {
    endTitle.textContent = 'INTENTA NUEVAMENTE';
    endTitle.className = 'lose';
    endWinImage.classList.add('hidden');
    endLoseImage.classList.remove('hidden');
    endLoseMessage.classList.remove('hidden');
    btnScreenshot.classList.add('hidden');
  }
  endScoreEl.textContent = `${state.goals} / ${state.maxShots} GOLES`;
}

// Screenshot capture function
function captureScreenshot() {
  try {
    // Hide screenshot button temporarily before capture
    btnScreenshot.style.display = 'none';

    // Render the scene one more time
    renderer.render(scene, camera);

    // Get the game canvas
    const gameCanvas = document.getElementById('game');

    // Capture the end-card only at high resolution
    const endCard = endScreen.querySelector('.end-card');
    html2canvas(endCard, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      allowTaint: true
    }).then(endCardCanvas => {
      // Restore screenshot button
      btnScreenshot.style.display = '';

      const fileName = `penales_${playerName}_${state.goals}goles.jpg`;

      // On mobile use Web Share API so user can save to Photos / share on social media
      if (navigator.share && navigator.canShare) {
        endCardCanvas.toBlob(async (blob) => {
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: '¡Gánale al Rey!', text: `${playerName} anotó ${state.goals} goles` });
            } catch (err) {
              if (err.name !== 'AbortError') {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = endCardCanvas.toDataURL('image/jpeg', 0.92);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }
          } else {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = endCardCanvas.toDataURL('image/jpeg', 0.92);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }, 'image/jpeg', 0.92);
      } else {
        // Desktop fallback: trigger download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = endCardCanvas.toDataURL('image/jpeg', 0.92);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }).catch(e => {
      console.error('html2canvas capture failed:', e);
      btnScreenshot.style.display = '';
      alert('No se pudo capturar la pantalla');
    });
  } catch (e) {
    console.error('Screenshot capture failed:', e);
    btnScreenshot.style.display = '';
    alert('No se pudo capturar la pantalla');
  }
}

// ---------- Kick ----------
let aimX = 0, aimY = 0; // -1..1 horizontal aim, 0..1 vertical (height)
let kickInProgress = false;

function performKick(targetX, targetY) {
  if (!state.playing || kickInProgress || state.shots >= state.maxShots) return;
  kickInProgress = true;
  instructionsEl.classList.add('hide');
  swipePointerEl.classList.add('hide');
  swipePointerLeftEl.classList.add('hide');
  swipePointerRightEl.classList.add('hide');

  // Fade in player opacity
  startPlayerFadeIn();

  // Play player animation
  if (playerAction) {
    playerAction.paused = false;
    playerAction.reset();
    playerAction.play();
  }

  // Wait until foot connects with ball, then launch with physics
  const handoffMs = 500;
  setTimeout(() => {
    launchBallPhysics(targetX, targetY);
  }, handoffMs);

  // Start fade-out after animation completes (approximately 1s after handoff)
  setTimeout(() => {
    startPlayerFadeOut();
  }, handoffMs + 500);
}

// Compute initial velocity needed to reach target from start with given flight time
function computeLaunchVelocity(start, target, flightTime, gravity) {
  const v = new THREE.Vector3().subVectors(target, start).divideScalar(flightTime);
  // Add gravity compensation on Y: y_target = y_start + vy*t - 0.5*g*t^2
  v.y = (target.y - start.y) / flightTime + 0.5 * gravity * flightTime;
  return v;
}

function launchBallPhysics(targetX, targetY) {
  if (!ballMesh || !state.goalBox) {
    finishShot(false);
    return;
  }

  const goal = state.goalBox;
  const center = goal.getCenter(new THREE.Vector3());
  const size = goal.getSize(new THREE.Vector3());

  const widthAxis = state.goalAxis === 'z' ? 'x' : 'z';
  const halfW = size[widthAxis] / 2;
  const heightH = size.y;

  // Allow aiming slightly outside the goal so the player can miss
  const aimRangeX = halfW * 1.5;
  const aimRangeY = heightH * 1.15;

  const target = new THREE.Vector3().copy(center);
  target[widthAxis] = center[widthAxis] + targetX * aimRangeX;
  target.y = goal.min.y + Math.max(0.05, targetY) * aimRangeY;

  // Use current ball world position as launch origin
  const start = ballMesh.getWorldPosition(new THREE.Vector3());

  // Shorter flight time => more launch energy / faster shot
  const dist = start.distanceTo(target);
  const flightTime = THREE.MathUtils.clamp(dist / 32, 0.28, 0.55);

  state._ballPos = start.clone();
  state._ballVel = computeLaunchVelocity(start, target, flightTime, state.gravity);
  // Boost overall energy a bit so the ball keeps moving after impact
  state._ballVel.multiplyScalar(1.0);
  state._ballSpinAxis = new THREE.Vector3(-state.goalDir, 0, 0);
  if (state.goalAxis === 'x') state._ballSpinAxis.set(0, 0, state.goalDir);
  state._scored = false;
  state._saved = false;
  state._crossedPlane = false;
  state._passedAbove = false; // track if ball passed above the goal
  state._timeAlive = 0;
  state._restTime = 0;
  state._saveTime = null;
  state._goalTime = null;
  state.ballMoving = true;
  
  // Play kick sound when ball simulation starts (Web Audio for low latency)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!playKickWebAudio(1)) {
    if (kickSound) {
      kickSound.volume = 1;
      kickSound.currentTime = 0;
      kickSound.play().catch(e => console.log('Kick sound play failed:', e));
    }
  }

  // Trigger goalkeeper dive: pick animation that matches ball direction (with some chance)
  triggerReyDive(targetX, targetY);

  // Light camera shake for dynamism
  startCameraShake(0.35, 0.09);

  // Trigger slight camera zoom toward goal
  if (camera && camera.isPerspectiveCamera) {
    if (camZoom.baseFov === null) {
      camZoom.baseFov = camera.fov;
      camZoom.currentFov = camera.fov;
    }
    if (camZoom.baseY === null) {
      camZoom.baseY = camera.position.y;
      camZoom.currentY = camera.position.y;
    }
    camZoom.targetFov = camZoom.baseFov * camZoom.zoomFactor;
    camZoom.targetY = camZoom.baseY + camZoom.yOffset;
  }
}

function startCameraShake(duration = 0.4, amplitude = 0.05) {
  if (!camera) return;
  // Always refresh base from current camera position so shake is always correct
  camShake.base.copy(camera.position);
  camShake.hasBase = true;
  camShake.duration = duration;
  camShake.time = duration;
  camShake.amplitude = amplitude;
  camShake.seed = Math.random() * 1000;
}

function updateCameraShake(dt) {
  if (!camera || !camShake.hasBase) return;
  if (camShake.time <= 0) {
    // Snap back to base if not already
    camera.position.copy(camShake.base);
    return;
  }
  camShake.time -= dt;
  const remain = Math.max(camShake.time, 0);
  const decay = remain / camShake.duration; // 1 -> 0
  const t = (camShake.duration - remain) * 35 + camShake.seed;
  // Pseudo-random smooth shake using stacked sines
  const ox = (Math.sin(t * 1.7) + Math.sin(t * 2.3) * 0.6) * 0.5;
  const oy = (Math.sin(t * 2.1 + 1.3) + Math.sin(t * 3.1 + 0.7) * 0.5) * 0.5;
  const oz = (Math.sin(t * 1.3 + 2.1)) * 0.4;
  const amp = camShake.amplitude * decay;
  camera.position.set(
    camShake.base.x + ox * amp,
    camShake.base.y + oy * amp,
    camShake.base.z + oz * amp
  );
}

function spawnConfetti() {
  confetti.particles = [];
  confetti.active = true;
  for (let i = 0; i < confetti.spawnCount; i++) {
    confetti.particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.7,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 1) * 15 - 5,
      size: Math.random() * 8 + 4,
      color: confetti.colors[Math.floor(Math.random() * confetti.colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      drag: Math.random() * 0.02 + 0.02,
      gravity: 0.25 + Math.random() * 0.15,
      life: 1,
      decay: Math.random() * 0.01 + 0.005,
    });
  }
}

function spawnEndConfetti() {
  confetti.particles = [];
  confetti.active = true;
  for (let i = 0; i < confetti.spawnCount; i++) {
    const isLeft = i % 2 === 0;
    const x = isLeft ? window.innerWidth * 0.2 : window.innerWidth * 0.8;
    confetti.particles.push({
      x: x,
      y: window.innerHeight * 0.1,
      vx: (Math.random() - 0.5) * 15 + (isLeft ? 5 : -5),
      vy: Math.random() * 10 + 5,
      size: Math.random() * 8 + 4,
      color: confetti.colors[Math.floor(Math.random() * confetti.colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      drag: Math.random() * 0.02 + 0.02,
      gravity: 0.25 + Math.random() * 0.15,
      life: 1,
      decay: Math.random() * 0.01 + 0.005,
    });
  }
}

function updateConfetti(dt) {
  if (!confetti.active) return;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  let alive = false;
  for (let i = 0; i < confetti.particles.length; i++) {
    const p = confetti.particles[i];
    p.vy += p.gravity;
    p.vx *= (1 - p.drag);
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.life -= p.decay;
    if (p.life > 0) {
      alive = true;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.globalAlpha = p.life;
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      confettiCtx.restore();
    }
  }
  if (!alive) {
    confetti.active = false;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

function startPlayerFadeOut() {
  playerFade.active = true;
  playerFade.time = 0;
  playerFade.targetOpacity = 0;
  // Store original positions before moving
  playerFade.originalPositions = [];
  for (const mesh of playerFade.meshes) {
    playerFade.originalPositions.push(mesh.position.clone());
  }
}

function startPlayerFadeIn() {
  playerFade.active = true;
  playerFade.time = 0;
  playerFade.duration = 0.5; // Fade in faster (0.5s)
  playerFade.targetOpacity = 1;
  playerFade.opacity = 0;
  // Restore player to original position
  if (playerFade.originalPlayerPosition) {
    player.position.copy(playerFade.originalPlayerPosition);
  }
  // Restore original positions before fading in
  for (let i = 0; i < playerFade.meshes.length; i++) {
    const mesh = playerFade.meshes[i];
    if (playerFade.originalPositions[i]) {
      mesh.position.copy(playerFade.originalPositions[i]);
    }
    if (mesh.material) {
      mesh.material.opacity = 0;
    }
    mesh.castShadow = false; // No shadow while fading in
  }
}

function resetPlayerOpacity() {
  playerFade.active = false;
  playerFade.opacity = 1;
  playerFade.targetOpacity = 1;
  for (const mesh of playerFade.meshes) {
    if (mesh.material) {
      mesh.material.opacity = 1;
    }
    mesh.castShadow = true;
  }
}

function startBallFadeIn() {
  if (!ballFade.mesh) return;
  ballFade.active = true;
  ballFade.time = 0;
  ballFade.duration = 0.3;
  ballFade.targetOpacity = 1;
  ballFade.opacity = 0;
  if (ballFade.mesh.material) {
    ballFade.mesh.material.opacity = 0;
  }
  ballFade.mesh.castShadow = false;
}

function updateBallFade(dt) {
  if (!ballFade.active || !ballFade.mesh) return;
  
  ballFade.time += dt;
  const progress = Math.min(ballFade.time / ballFade.duration, 1);
  
  if (ballFade.targetOpacity === 1) {
    ballFade.opacity = progress;
  } else {
    ballFade.opacity = 1 - progress;
  }
  
  if (ballFade.mesh.material) {
    ballFade.mesh.material.opacity = ballFade.opacity;
  }
  if (ballFade.opacity >= 1) {
    ballFade.mesh.castShadow = true;
  } else if (ballFade.opacity <= 0) {
    ballFade.mesh.castShadow = false;
  }
  
  if (progress >= 1) {
    ballFade.active = false;
  }
}

function updatePlayerFade(dt) {
  if (!playerFade.active) return;
  
  playerFade.time += dt;
  const progress = Math.min(playerFade.time / playerFade.duration, 1);
  
  if (playerFade.targetOpacity === 1) {
    // Fade in: from 0 to 1
    playerFade.opacity = progress;
  } else {
    // Fade out: from 1 to 0
    playerFade.opacity = 1 - progress;
  }
  
  for (const mesh of playerFade.meshes) {
    if (mesh.material) {
      mesh.material.opacity = playerFade.opacity;
    }
    // Enable shadow casting only when fully visible
    if (playerFade.opacity >= 1) {
      mesh.castShadow = true;
    } else if (playerFade.opacity <= 0) {
      mesh.castShadow = false;
    }
  }
  
  if (progress >= 1) {
    playerFade.active = false;
    // If fade-out completed, move player out of frame to avoid artifacts
    if (playerFade.targetOpacity === 0) {
      for (const mesh of playerFade.meshes) {
        mesh.position.set(0, -100, 0); // Move far below the scene
      }
    }
  }
}

function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function classifyDive(name) {
  const n = (name || '').toLowerCase();
  if (/centro/.test(n)) return 'mid';
  if (/apatada/.test(n)) return 'mid';
  if (/patada/.test(n)) return 'mid';
  if (/arribder|arribader/.test(n)) return 'up';
  if (/izquierda/.test(n)) return 'left';
  if (/derecha/.test(n)) return 'right';
  if (/left|izq/.test(n)) return 'left';
  if (/right|der/.test(n)) return 'right';
  if (/up|jump|high|arriba|alto|top/.test(n)) return 'up';
  if (/down|low|abajo|bajo|dive/.test(n)) return 'down';
  return 'mid';
}

function targetCategory(targetX, targetY) {
  if (targetY > 0.65) return 'up';
  if (Math.abs(targetX) < 0.22) return 'mid';
  return targetX < 0 ? 'left' : 'right';
}

function triggerReyDive(targetX, targetY) {
  if (!reyMixer || !reyDiveActions.length) return;
  // Stop previous dive cleanly
  if (reyCurrentDive) reyCurrentDive.stop();

  const wantedCat = targetCategory(targetX, targetY);
  // Difficulty: probability rey picks the matching side
  const saveChance = 1.0;
  let pool;
  if (Math.random() < saveChance) {
    pool = reyDiveActions.filter(d => d.category === wantedCat);
    if (!pool.length) pool = reyDiveActions; // no exact match, allow any
  } else {
    pool = reyDiveActions.filter(d => d.category !== wantedCat);
    if (!pool.length) pool = reyDiveActions;
  }

  // For center shots, prioritize centro and patada animations
  if (wantedCat === 'mid') {
    const centroAnim = pool.find(d => /centro/.test(d.action.getClip().name));
    const patadaAnim = pool.find(d => /patada/.test(d.action.getClip().name));
    const apatadaAnim = pool.find(d => /apatada/.test(d.action.getClip().name));
    
    // If centro or patada exist and haven't been used recently, prefer them
    const midAnims = [centroAnim, patadaAnim, apatadaAnim].filter(a => a && !reyUsedAnimations.includes(a.action));
    if (midAnims.length > 0) {
      pool = midAnims;
    }
  }

  // Filter out already used animations
  let candidates = pool.filter(d => !reyUsedAnimations.includes(d.action));
  
  // Filter out "arriba" animation if cooldown is active
  if (reyArribaCooldown > 0) {
    reyArribaCooldown--;
    candidates = candidates.filter(d => !/arriba/.test(d.action.getClip().name) || /arribder|arribader/.test(d.action.getClip().name));
  }
  
  // If all animations have been used, reset and allow all
  if (!candidates.length) {
    reyUsedAnimations = [];
    candidates = pool;
  }

  // Pick random animation from remaining candidates
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  
  // Track this animation as used
  reyUsedAnimations.push(pick.action);
  
  // If "arriba" was selected, set cooldown
  if (/arriba/.test(pick.action.getClip().name) && !/arribder|arribader/.test(pick.action.getClip().name)) {
    reyArribaCooldown = 3; // skip next 3 dives
  }
  
  reyDiveIndex++;

  pick.action.reset();
  pick.action.play();
  reyCurrentDive = pick.action;
  if (reyIdleAction) reyIdleAction.stop();
}

function returnReyToIdle() {
  if (!reyMixer) return;
  if (reyCurrentDive) {
    reyCurrentDive.stop();
    reyCurrentDive = null;
  }
  if (reyIdleAction) {
    reyIdleAction.weight = 1;
    reyIdleAction.reset();
    reyIdleAction.play();
  }
}

function updateBallPhysics(dt) {
  if (!state.ballMoving || !ballMesh) return;

  // Sub-step for stable collisions
  const steps = 4;
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    integrateBall(sdt);
    if (!state.ballMoving) break;
  }

  // Apply ball world position to mesh (in parent local space)
  const worldPos = state._ballPos;
  if (ballMesh.parent) {
    const local = ballMesh.parent.worldToLocal(worldPos.clone());
    ballMesh.position.copy(local);
  } else {
    ballMesh.position.copy(worldPos);
  }

  // Natural spin: axis derived from current horizontal velocity (rolling without slipping)
  const vx = state._ballVel.x, vz = state._ballVel.z;
  const horizSpeed = Math.hypot(vx, vz);
  if (horizSpeed > 0.05) {
    // axis = up x velDir  =>  (vz/vh, 0, -vx/vh) for a ball that rolls forward in its motion direction
    const ax = vz / horizSpeed;
    const az = -vx / horizSpeed;
    state._ballSpinAxis.set(ax, 0, az);
    // Angular speed for pure rolling: omega = v / r
    const omega = horizSpeed / Math.max(ballRadius, 0.05);
    // Grass spin multiplier: ball spins more when touching ground
    const groundY = state.groundY + ballRadius;
    const onGround = state._ballPos.y <= groundY + 0.05;
    const spinMultiplier = onGround ? 1.8 : 1.0;
    ballMesh.rotateOnWorldAxis(state._ballSpinAxis, omega * dt * spinMultiplier);
  }
}

// ---------- Net Cloth Simulation ----------
function registerNetContact(ballWorldPos, pushDirWorld) {
  if (!netPosAttr || !redMesh) return;
  redMesh.updateWorldMatrix(true, true);
  const localPoint = redMesh.worldToLocal(ballWorldPos.clone());
  // Convert push direction to local (rotation only)
  const wq = redMesh.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localDirVec = pushDirWorld.clone().applyQuaternion(wq);
  const intensity = localDirVec.length();
  if (intensity < 1e-6) return;
  localDirVec.normalize();

  if (!netImpact.active) {
    netImpact.localPoint.copy(localPoint);
    netImpact.localDir.copy(localDirVec);
  } else {
    netImpact.localPoint.lerp(localPoint, 0.5);
    netImpact.localDir.lerp(localDirVec, 0.4).normalize();
  }
  netImpact.active = true;
  netImpact.releasing = false;

  // Strength scales with impact intensity, in local-space units
  const targetStrength = THREE.MathUtils.clamp(intensity * 0.06, 0.08, 0.7) / netWorldScaleAvg;
  netImpact.strength += (targetStrength - netImpact.strength) * 0.55;
}

function updateNetCloth(dt) {
  if (!netPosAttr || !netOriginalPositions) return;

  // Spring back when releasing - cloth-like behavior
  if (netImpact.releasing) {
    netImpact.t += dt;
    const springDur = 1.6;
    const phase = Math.min(netImpact.t / springDur, 1);
    // Cloth-like: faster decay, fewer oscillations
    const decay = Math.exp(-4.0 * phase);
    const oscill = Math.cos(phase * Math.PI * 4);
    netImpact.strength = netImpact.peakStrength * decay * oscill;
    if (phase >= 1) {
      netImpact.releasing = false;
      netImpact.strength = 0;
    }
  }

  // If no deformation, ensure mesh is at rest
  if (!netImpact.active && !netImpact.releasing) {
    if (netPosAttr._dirty) {
      netPosAttr.array.set(netOriginalPositions);
      netPosAttr.needsUpdate = true;
      netGeom.computeVertexNormals();
      netPosAttr._dirty = false;
    }
    return;
  }

  // Falloff radius scales with net size (in local units) - larger = softer cloth
  const radius = (netRefSize * 0.75) / netWorldScaleAvg;
  const invR = 1 / Math.max(radius, 1e-4);
  const cx = netImpact.localPoint.x;
  const cy = netImpact.localPoint.y;
  const cz = netImpact.localPoint.z;
  const dx0 = netImpact.localDir.x;
  const dy0 = netImpact.localDir.y;
  const dz0 = netImpact.localDir.z;
  const amp = netImpact.strength;

  const arr = netPosAttr.array;
  const orig = netOriginalPositions;
  const count = netPosAttr.count;
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const ox = orig[i3], oy = orig[i3 + 1], oz = orig[i3 + 2];
    
    const dx = ox - cx, dy = oy - cy, dz = oz - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * invR;
    if (d >= 1) {
      arr[i3] = ox; arr[i3 + 1] = oy; arr[i3 + 2] = oz;
      continue;
    }
    // Smooth falloff with a slight ripple (cosine bell + small secondary wave)
    const bell = Math.pow(1 - d * d, 2);
    const ripple = 1 + 0.15 * Math.cos(d * Math.PI * 2.0);
    const f = bell * ripple * amp;
    // Multiply force by vertex weight (0=fixed edge, 1=fully movable)
    const weight = netVertexWeights[i];
    arr[i3] = ox + dx0 * f * weight;
    arr[i3 + 1] = oy + dy0 * f * weight;
    arr[i3 + 2] = oz + dz0 * f * weight;
  }
  netPosAttr.needsUpdate = true;
  netPosAttr._dirty = true;
  netGeom.computeVertexNormals();
}

function integrateBall(dt) {
  state._timeAlive += dt;
  // Gravity
  state._ballVel.y -= state.gravity * dt;

  // Tentative new position
  const prev = state._ballPos.clone();
  state._ballPos.addScaledVector(state._ballVel, dt);

  // Marco (goalpost frame) collision - per-triangle distance check
  if (marcoTriangles.length > 0) {
    const bp = state._ballPos;
    const closest = new THREE.Vector3();
    const tri = new THREE.Triangle();
    for (let i = 0; i < marcoTriangles.length; i++) {
      const t = marcoTriangles[i];
      tri.set(t.a, t.b, t.c);
      tri.closestPointToPoint(bp, closest);
      const dx = bp.x - closest.x;
      const dy = bp.y - closest.y;
      const dz = bp.z - closest.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < ballRadius * ballRadius) {
        const d = Math.sqrt(d2);
        // Push ball out along contact normal (from triangle to ball)
        const nx = d > 1e-6 ? dx / d : t.normal.x;
        const ny = d > 1e-6 ? dy / d : t.normal.y;
        const nz = d > 1e-6 ? dz / d : t.normal.z;
        const pushOut = ballRadius - d + 0.001;
        bp.x += nx * pushOut;
        bp.y += ny * pushOut;
        bp.z += nz * pushOut;
        // Reflect velocity with restitution (metal post bounce)
        const vDotN = state._ballVel.x * nx + state._ballVel.y * ny + state._ballVel.z * nz;
        if (vDotN < 0) {
          const restitution = 0.55;
          state._ballVel.x -= (1 + restitution) * vDotN * nx;
          state._ballVel.y -= (1 + restitution) * vDotN * ny;
          state._ballVel.z -= (1 + restitution) * vDotN * nz;
          // Slight tangential damping
          state._ballVel.multiplyScalar(0.85);
        }
      }
    }
  }

  // Net (red) collision: the front face is the OPEN goal mouth - ball enters freely.
  // Back, top and sides of the AABB act as the cloth net walls and BLOCK the ball.
  let touchingNet = false;
  // Goalkeeper collision: per-bone sphere check, follows the animated pose
  if (!state._saved && reySkeleton) {
    const bp = state._ballPos;
    const bones = reySkeleton.bones;
    const r = reyBoneRadius + ballRadius;
    const r2 = r * r;
    let hitCenter = null;
    const tmp = new THREE.Vector3();
    for (let bi = 0; bi < bones.length; bi++) {
      bones[bi].getWorldPosition(tmp);
      const d2 = bp.distanceToSquared(tmp);
      if (d2 < r2) {
        hitCenter = tmp.clone();
        break;
      }
    }
    if (hitCenter) {
      if (!state._saved) {
        state._saveTime = state._timeAlive;
        state._saved = true;
        // Play kick sound when goalkeeper saves (Web Audio for low latency)
        if (!playKickWebAudio(0.6)) {
          if (kickSound) {
            kickSound.volume = 0.6;
            kickSound.currentTime = 0;
            kickSound.play().catch(e => console.log('Kick sound play failed:', e));
          }
        }
      }
      const speed = state._ballVel.length();
      // Always bounce forward towards shooter (opposite to goal direction)
      const forward = new THREE.Vector3();
      if (state.goalAxis === 'z') forward.set(0, 0, -state.goalDir);
      else forward.set(-state.goalDir, 0, 0);
      forward.normalize();
      // Push ball out of penetration
      bp.copy(hitCenter).addScaledVector(forward, r + 0.05);
      // Reflect velocity towards forward direction with restitution
      state._ballVel.copy(forward).multiplyScalar(speed * 0.7);
      // Add upward impulse for visible deflection
      state._ballVel.y = Math.max(state._ballVel.y, 3 + Math.random() * 2);
      // Add slight horizontal spread for realism
      state._ballVel.x += (Math.random() - 0.5) * 2;
      if (state.goalAxis === 'z') state._ballVel.z += (Math.random() - 0.5) * 2;
      else state._ballVel.x += (Math.random() - 0.5) * 2;
    }
  }

  if (state.goalBox && state.goalAxis) {
    const box = state.goalBox;
    const ax = state.goalAxis;
    const wAx = ax === 'z' ? 'x' : 'z';
    const r = ballRadius;
    const p = state._ballPos;
    const dirSign = state.goalDir;

    // How far past the front (open) plane is the ball, along goal direction
    const distPastFront = (p[ax] - state.goalPlaneZ) * dirSign;
    const insideLatW = p[wAx] > box.min[wAx] - r && p[wAx] < box.max[wAx] + r;
    const insideLatH = p.y > box.min.y - r && p.y < box.max.y + r;

    // Check if ball passes above the goal
    if (distPastFront > 0 && p.y > box.max.y + r) {
      state._passedAbove = true;
    }

    if (distPastFront > -r * 0.5 && insideLatW && insideLatH && !state._passedAbove) {
      // Ball has crossed the goal mouth -> GOAL
      if (!state._scored) state._goalTime = state._timeAlive;
      state._scored = true;

      // Wall planes and inward bounce logic
      const backPlane  = dirSign > 0 ? box.max[ax] : box.min[ax];
      const leftPlane  = box.min[wAx];
      const rightPlane = box.max[wAx];
      const topPlane   = box.max.y;

      // Each wall: { axis, plane, vSign }
      // vSign = sign of ball velocity component that means "into the wall"
      // Back: ball moves in +dirSign; vSign = dirSign
      // Top: ball moves in +y; vSign = +1
      // Left (min wAx): ball moves in -wAx; vSign = -1
      // Right (max wAx): ball moves in +wAx; vSign = +1
      const walls = [
        { axis: ax,  plane: backPlane,  vSign: dirSign },
        { axis: 'y', plane: topPlane,   vSign: 1 },
        { axis: wAx, plane: leftPlane,  vSign: -1 },
        { axis: wAx, plane: rightPlane, vSign: 1 },
      ];

      for (const w of walls) {
        // Signed distance from ball center to wall, measured along vSign direction
        const sd = (w.plane - p[w.axis]) * w.vSign;
        if (sd < r) {
          // Penetration; push ball back inside the goal volume
          p[w.axis] = w.plane - w.vSign * r;
          const v = state._ballVel[w.axis];
          if (v * w.vSign > 0) {
            // Reflect with low restitution (cloth absorbs most energy)
            state._ballVel[w.axis] = -v * 0.18;
          }
          // Tangential damping (cloth grabs the ball)
          if (w.axis !== 'x') state._ballVel.x *= 0.65;
          if (w.axis !== 'y') state._ballVel.y *= 0.7;
          if (w.axis !== 'z') state._ballVel.z *= 0.65;
          touchingNet = true;
          // Cloth deformation centered at the actual contact point on the wall
          const contactWorld = p.clone();
          contactWorld[w.axis] = w.plane;
          // Push direction = into the wall (vSign on its axis)
          const pushDirWorld = new THREE.Vector3();
          pushDirWorld[w.axis] = w.vSign;
          registerNetContact(contactWorld, pushDirWorld.multiplyScalar(Math.max(state._ballVel.length(), Math.abs(v))));
        }
      }
    }
  }
  if (!touchingNet && netImpact.active) {
    // Ball just left net - start spring-back oscillation
    netImpact.active = false;
    netImpact.releasing = true;
    netImpact.t = 0;
    netImpact.peakStrength = netImpact.strength;
  }

  // Ground collision (piso) - thick grass: low bounce, very high friction
  const groundY = state.groundY + ballRadius;
  if (state._ballPos.y < groundY) {
    const penetration = groundY - state._ballPos.y;
    state._ballPos.y = penetration > 0.05 ? state.groundY + ballRadius : groundY;
    if (state._ballVel.y < -0.2) {
      // Real bounce off grass
      const impactSpeed = -state._ballVel.y;
      const restitution = impactSpeed > 4 ? 0.45 : (impactSpeed > 2 ? 0.32 : 0.18);
      state._ballVel.y = impactSpeed * restitution;
      // Moderate horizontal friction on impact (grass grabs the ball less)
      const friction = impactSpeed > 3 ? 0.35 : 0.25;
      state._ballVel.x *= friction;
      state._ballVel.z *= friction;
    } else {
      // Rolling on grass: moderate drag for gradual stop
      state._ballVel.y = 0;
      const rollDrag = Math.pow(0.15, dt); // ~85% horizontal energy lost per second
      state._ballVel.x *= rollDrag;
      state._ballVel.z *= rollDrag;
      // Linear stopping force so ball comes to rest cleanly (not exponential tail)
      const speed2 = Math.hypot(state._ballVel.x, state._ballVel.z);
      if (speed2 > 0) {
        const stop = Math.min(6.0 * dt, speed2);
        state._ballVel.x -= (state._ballVel.x / speed2) * stop;
        state._ballVel.z -= (state._ballVel.z / speed2) * stop;
      }
    }
  }

  // Stop conditions: ball nearly resting on ground
  const speed = state._ballVel.length();
  const onGround = state._ballPos.y <= groundY + 0.01;
  if (onGround && speed < 0.35) {
    state._restTime += dt;
  } else {
    state._restTime = 0;
  }

  if (state._restTime > 0.25 || state._timeAlive > 2.8) {
    state.ballMoving = false;
    if (netImpact.active) {
      netImpact.active = false;
      netImpact.releasing = true;
      netImpact.t = 0;
      netImpact.peakStrength = netImpact.strength;
    }
    finishShot(!!state._scored);
  }
}

function finishShot(isGoal) {
  state.shots += 1;
  // Determine which collision happened first
  const isSave = !!state._saved && (state._goalTime === null || state._saveTime < state._goalTime);
  const realGoal = isGoal && !isSave;
  if (realGoal) state.goals += 1;
  let label, cls;
  if (isSave) { label = 'ATAJADA'; cls = 'miss'; }
  else if (realGoal) { label = '¡GOL!'; cls = 'goal'; }
  else { label = 'FALLASTE'; cls = 'miss'; }
  // GOL stays 1 second longer (2200ms vs 1200ms)
  const messageDuration = realGoal ? 2200 : 1200;
  showMessage(label, cls, messageDuration);
  // Play abu sound when shot is missed
  if (!isSave && !realGoal) {
    if (abuSound) {
      abuSound.volume = 1;
      abuSound.currentTime = 0;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        setTimeout(() => abuSound.play().catch(e => console.log('Abu sound play failed:', e)), 30);
      } else {
        abuSound.play().catch(e => console.log('Abu sound play failed:', e));
      }
    }
  }
  if (realGoal) {
    // Play goal sound
    if (golSound) {
      golSound.volume = 1;
      golSound.currentTime = 0;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        setTimeout(() => golSound.play().catch(e => console.log('Gol sound play failed:', e)), 30);
      } else {
        golSound.play().catch(e => console.log('Gol sound play failed:', e));
      }
    }
    spawnConfetti();
    // Play stadium 'gente' (crowd) animation at normal speed for goal celebration
    if (stadiumGenteAction) {
      stadiumGenteAction.timeScale = 1.0; // Normal speed for goal
      stadiumGenteAction.reset();
      stadiumGenteAction.play();
      // Return to slow speed after 3 seconds (1 second longer for GOL)
      setTimeout(() => {
        if (stadiumGenteAction) {
          stadiumGenteAction.timeScale = 0.05; // Very slow speed again
        }
      }, 3000);
    }
  }
  updateHUD();

  // Adjust reset timeout: 2400ms for GOL (1 second longer), 1400ms for others
  const resetTimeout = realGoal ? 2400 : 1400;
  setTimeout(() => {
    kickInProgress = false;
    if (state.shots >= state.maxShots) {
      endGame();
    } else {
      // Rewind player animation to first frame and hold it there
      if (playerAction && playerMixer) {
        playerAction.stop();
        playerAction.reset();
        playerAction.play();
        playerAction.time = 0;
        playerAction.paused = true;
        playerMixer.update(0);
      }
      // Goalkeeper returns to idle
      returnReyToIdle();
      resetBall();
      instructionsEl.classList.remove('hide');
      swipePointerEl.classList.remove('hide');
      swipePointerLeftEl.classList.remove('hide');
      swipePointerRightEl.classList.remove('hide');
    }
  }, resetTimeout);
}

// ---------- Input (swipe / drag) ----------
let pointerStart = null;
let pointerCurrent = null;

function onPointerDown(e) {
  if (!state.playing || kickInProgress) return;
  const p = getPoint(e);
  pointerStart = p;
  pointerCurrent = p;
}
function onPointerMove(e) {
  if (!pointerStart) return;
  pointerCurrent = getPoint(e);
}
function onPointerUp(e) {
  if (!pointerStart || !pointerCurrent) { pointerStart = null; return; }
  const dx = pointerCurrent.x - pointerStart.x;
  const dy = pointerStart.y - pointerCurrent.y; // up is positive
  pointerStart = null;
  pointerCurrent = null;

  const minSwipe = Math.min(window.innerWidth, window.innerHeight) * 0.05;
  if (Math.hypot(dx, dy) < minSwipe) return; // ignore tap

  // Map dx (relative to viewport) to aim X [-1, 1]
  const ax = THREE.MathUtils.clamp(dx / (window.innerWidth * 0.35), -1, 1);
  // Map dy (upward swipe = higher shot)
  const ay = THREE.MathUtils.clamp(dy / (window.innerHeight * 0.5), 0.05, 1);

  performKick(ax, ay);
}
function getPoint(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown, { passive: false });
window.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp);

// ---------- Resize ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (camera && camera.isPerspectiveCamera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', onResize);
onResize();
resizeConfetti();

// ---------- Page Visibility API - Pause/Resume Audio ----------
let wasPlaying = {}; // Track which audios were playing before page was hidden

document.addEventListener('visibilitychange', () => {
  const allAudios = [bgMusic, ruidoG, silbStart, silbEnd, kickSound, golSound, abuSound];
  
  if (document.hidden) {
    // Page is hidden - pause all audio and track which were playing
    allAudios.forEach(audio => {
      if (audio) {
        wasPlaying[audio.id] = !audio.paused && audio.currentTime > 0;
        audio.pause();
      }
    });
  } else {
    // Page is visible again - resume audio that was playing
    allAudios.forEach(audio => {
      if (audio && wasPlaying[audio.id] && state.playing) {
        audio.play().catch(e => console.log('Audio resume failed:', e));
      }
    });
    wasPlaying = {};
  }
});

// ---------- Main loop ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (playerMixer) playerMixer.update(dt);
  if (reyMixer) reyMixer.update(dt);
  if (stadiumMixer) stadiumMixer.update(dt);
  updateBallPhysics(dt);
  updateNetCloth(dt);
  updateCameraShake(dt);
  updateCameraZoom(dt);
  updateConfetti(dt);
  updatePlayerFade(dt);
  updateBallFade(dt);
  renderer.render(scene, camera);
}

function updateCameraZoom(dt) {
  if (!camera || !camera.isPerspectiveCamera) return;
  // Lerp FOV
  if (camZoom.targetFov !== null && camZoom.currentFov !== null) {
    const diff = camZoom.targetFov - camZoom.currentFov;
    if (Math.abs(diff) < 0.01) {
      camZoom.currentFov = camZoom.targetFov;
    } else {
      camZoom.currentFov += diff * Math.min(1, camZoom.speed * dt);
    }
    camera.fov = camZoom.currentFov;
    camera.updateProjectionMatrix();
  }
  // Lerp Y position
  if (camZoom.targetY !== null && camZoom.currentY !== null) {
    const diffY = camZoom.targetY - camZoom.currentY;
    if (Math.abs(diffY) < 0.001) {
      camZoom.currentY = camZoom.targetY;
    } else {
      camZoom.currentY += diffY * Math.min(1, camZoom.speed * dt);
    }
    camera.position.y = camZoom.currentY;
    // Keep shake base in sync so shake oscillates around new Y
    if (camShake.hasBase) camShake.base.y = camZoom.currentY;
  }
}
animate();

// ---------- Buttons ----------
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  // Create and unlock AudioContext synchronously within user gesture (required by Chrome mobile)
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  // Unlock HTML5 Audio on mobile silently (muted)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    const allAudios = [bgMusic, ruidoG, silbStart, silbEnd, kickSound, golSound, abuSound];
    allAudios.forEach(audio => {
      if (audio) {
        audio.muted = true;
        const p = audio.play();
        if (p && p.then) {
          p.then(() => {
            audio.pause();
            audio.currentTime = 0;
          }).catch(() => {});
        }
      }
    });
  }
  if (!state.loaded) {
    loading.classList.remove('hidden');
    try {
      await loadAssets();
    } catch (err) {
      console.error('Error cargando assets', err);
      alert('Error cargando assets: ' + err.message);
      btnStart.disabled = false;
      loading.classList.add('hidden');
      return;
    }
    loading.classList.add('hidden');
    onResize();
    // Load kick sound into Web Audio buffer for zero-latency playback
    await loadKickBuffer();
  }
  startGame();
});

btnRestart.addEventListener('click', () => {
  endScreen.classList.add('hidden');
  splash.classList.remove('hidden');
  btnStart.disabled = false;
  playerNameInput.value = '';
});

btnHome.addEventListener('click', () => {
  endScreen.classList.add('hidden');
  splash.classList.remove('hidden');
  btnStart.disabled = false;
  playerNameInput.value = '';
});

btnScreenshot.addEventListener('click', () => {
  captureScreenshot();
});

// Audio toggle button
// Web Audio API for low-latency kick sound
let audioCtx = null;
let kickBuffer = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function loadKickBuffer() {
  try {
    const ctx = getAudioCtx();
    const response = await fetch('assets/sound/kick.mp3');
    const arrayBuffer = await response.arrayBuffer();
    kickBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.log('Web Audio kick load failed:', e);
  }
}

function playKickWebAudio(volume = 1) {
  try {
    if (!kickBuffer) return false;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = kickBuffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
    return true;
  } catch (e) {
    console.log('Web Audio kick play failed:', e);
    return false;
  }
}

let audioEnabled = true;
btnAudio.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  const audioIconOn = document.getElementById('audioIconOn');
  const audioIconOff = document.getElementById('audioIconOff');

  if (audioEnabled) {
    audioIconOn.style.display = 'block';
    audioIconOff.style.display = 'none';
    btnAudio.classList.remove('audio-off');
    btnAudio.classList.add('audio-on');
    bgMusic.muted = false;
    ruidoG.muted = false;
  } else {
    audioIconOn.style.display = 'none';
    audioIconOff.style.display = 'block';
    btnAudio.classList.remove('audio-on');
    btnAudio.classList.add('audio-off');
    bgMusic.muted = true;
    ruidoG.muted = true;
  }
});

// Exit button
btnExit.addEventListener('click', () => {
  hud.classList.add('hidden');
  splash.classList.remove('hidden');
  btnStart.disabled = false;
  playerNameInput.value = '';
  state.playing = false;
  state.shots = 0;
  state.goals = 0;
  kickInProgress = false;
  pointerStart = null;
  pointerCurrent = null;
  bgMusic.pause();
  bgMusic.currentTime = 0;
  ruidoG.pause();
  ruidoG.currentTime = 0;
  returnReyToIdle();
  resetBall();
});
