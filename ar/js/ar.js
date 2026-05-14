// AR face-tracking scene for sombybarb.glb — front (selfie) camera.
// Head pose (pitch / yaw / roll) is derived from MediaPipe FaceLandmarker landmarks.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.mjs';

// ── Tuning constants ────────────────────────────────────────────────────────
const SCALE_FACTOR  = 3.7;   // hat size = face-height * SCALE_FACTOR
const OFFSET_Y      = -.92; // fraction of face-height to lift above forehead
const SMOOTH_POS    = 0.25;  // position lerp speed per frame (lower = smoother but more lag)
const SMOOTH_ROT    = 0.25;  // rotation slerp speed per frame
// ────────────────────────────────────────────────────────────────────────────

export const initReyArScene = (options = {}) => {
  let scene, camera;
  let hatGroup   = null;   // wrapper Group for the loaded model
  let faceLandmarker = null;
  let videoElement   = null;
  let ownedStream    = null; // only set if WE created the camera stream (not XR8's)

  // Smoothed state
  const _smoothPos  = new THREE.Vector3();
  const _smoothQuat = new THREE.Quaternion();
  let   _firstFrame = true;

  // Reusable temp objects (avoid per-frame GC)
  const _camPos    = new THREE.Vector3();
  const _vForehead = new THREE.Vector3();
  const _vChin     = new THREE.Vector3();
  const _vLE       = new THREE.Vector3();
  const _vRE       = new THREE.Vector3();
  const _xAxis     = new THREE.Vector3();
  const _yAxis     = new THREE.Vector3();
  const _zAxis     = new THREE.Vector3();
  const _basis     = new THREE.Matrix4();
  const _targetQuat = new THREE.Quaternion();
  const _targetPos  = new THREE.Vector3();

  // ── Convert a MediaPipe normalised landmark to a world point at `depth` ──
  // No manual X-mirror: 8th Wall's front-camera three.js matrix already
  // encodes the correct mapping from raw-video coords to world coords.
  const lmToWorld = (lm, depth, out) => {
    // lm.z: negative = closer to camera, positive = further (same scale as lm.x)
    // Using it gives each landmark its own depth → pitch & yaw captured correctly
    const d = Math.max(depth * (1 + lm.z), 0.05);
    out.set(lm.x * 2 - 1, -(lm.y * 2 - 1), 0.5)
       .unproject(camera)
       .sub(_camPos).normalize()
       .multiplyScalar(d)
       .add(_camPos);
    return out;
  };

  // ── Load sombybarb.glb ───────────────────────────────────────────────────
  const loadModel = async () => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const gltf = await loader.loadAsync('assets/3D/somybarb.glb');

    // Log mesh names for reference
    const names = [];
    gltf.scene.traverse(o => { if (o.isMesh) names.push(o.name || '(unnamed)'); });
    console.log('somybarb.glb meshes:', names);

    // Wrap entire scene in a Group so we can move/rotate/scale as one unit
    hatGroup = new THREE.Group();
    // Correct model orientation: rotate 180° around Y to fix horizontal flip
    gltf.scene.rotation.y = Math.PI;
    hatGroup.add(gltf.scene);
    hatGroup.visible = false;
    gltf.scene.traverse(o => {
      if (o.isMesh) {
        o.frustumCulled = false;
        // Cull back faces so inverted normals are not rendered
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { m.side = THREE.FrontSide; });
        }
      }
    });
    scene.add(hatGroup);

    console.log('somybarb.glb loaded ✓');
    dracoLoader.dispose();
  };

  // ── Init MediaPipe FaceLandmarker ────────────────────────────────────────
  const initFaceLandmarker = async () => {
    if (!hatGroup) { console.error('Model not loaded yet'); return; }
    try {
      console.log('Initializing FaceLandmarker…');

      // ── Reuse XR8's front-camera video element to avoid dual-stream conflict on Samsung ──
      // XR8 already owns the front camera; a second getUserMedia call fails silently on Samsung.
      const allVideos = Array.from(document.querySelectorAll('video'));
      const xrVideo   = allVideos.find(v => v.srcObject && !v.paused && v.videoWidth > 0);

      if (xrVideo) {
        videoElement = xrVideo;
        ownedStream  = null; // XR8 owns it — do not stop it on cleanup
        console.log('Reusing XR8 camera feed:', xrVideo.videoWidth, '×', xrVideo.videoHeight);
      } else {
        // Fallback: create own stream (desktop or unexpected state)
        videoElement = document.createElement('video');
        videoElement.style.display = 'none';
        videoElement.autoplay    = true;
        videoElement.playsInline = true;
        videoElement.muted       = true;
        document.body.appendChild(videoElement);

        ownedStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        videoElement.srcObject = ownedStream;

        // Wait for video to be truly ready (Samsung fires onloadedmetadata early)
        await new Promise(res => {
          const check = () => {
            if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
              res();
            } else {
              videoElement.onloadedmetadata = null;
              setTimeout(check, 100);
            }
          };
          videoElement.onloadedmetadata = () => videoElement.play().then(check).catch(check);
          if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
            videoElement.play().then(check).catch(check);
          }
        });
      }
      console.log('Camera ready:', videoElement.videoWidth, '×', videoElement.videoHeight);

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
      );

      // Try GPU delegate first, fall back to CPU for Samsung/Exynos/Mali GPUs
      const createLandmarker = async (delegate) => FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      try {
        faceLandmarker = await createLandmarker('GPU');
        console.log('FaceLandmarker ready ✓ (GPU)');
      } catch (gpuErr) {
        console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
        faceLandmarker = await createLandmarker('CPU');
        console.log('FaceLandmarker ready ✓ (CPU fallback)');
      }
      processFrame();
    } catch (err) {
      console.error('FaceLandmarker init error:', err);
    }
  };

  // ── Per-frame detection loop ─────────────────────────────────────────────
  let _lastVideoTime = -1;

  const processFrame = () => {
    if (faceLandmarker && videoElement && videoElement.readyState >= 2 &&
        videoElement.currentTime !== _lastVideoTime) {
      _lastVideoTime = videoElement.currentTime;
      try {
        const res = faceLandmarker.detectForVideo(videoElement, performance.now());
        if (res.faceLandmarks && res.faceLandmarks.length > 0) {
          updateHat(res.faceLandmarks[0]);
        } else {
          if (hatGroup) hatGroup.visible = false;
          _firstFrame = true;
        }
      } catch (e) { console.error('Detection error:', e); }
    }
    requestAnimationFrame(processFrame);
  };

  // ── Update hat transform every frame ────────────────────────────────────
  const updateHat = (lm) => {
    if (!hatGroup || !camera) return;

    // Key landmarks
    // lm[10]  = top of forehead
    // lm[152] = chin bottom
    // lm[33]  = person's left eye outer corner  (right side of raw video)
    // lm[263] = person's right eye outer corner (left side of raw video)
    const lmForehead = lm[10];
    const lmChin     = lm[152];
    const lmLE       = lm[33];
    const lmRE       = lm[263];

    // Estimated depth from normalised inter-eye distance
    const faceWidthNorm = Math.abs(lmLE.x - lmRE.x);
    const depth = THREE.MathUtils.clamp(0.18 / Math.max(faceWidthNorm, 0.04), 0.3, 2.0);

    camera.getWorldPosition(_camPos);

    // Project landmarks to world space
    lmToWorld(lmForehead, depth, _vForehead);
    lmToWorld(lmChin,     depth, _vChin);
    lmToWorld(lmLE,       depth, _vLE);
    lmToWorld(lmRE,       depth, _vRE);

    // ── Build orthonormal head-local basis ──────────────────────────────
    // +X  → from person's right-eye toward left-eye (i.e. LE - RE in world)
    _xAxis.copy(_vLE).sub(_vRE).normalize();
    // +Y  → from chin toward forehead (up)
    _yAxis.copy(_vForehead).sub(_vChin).normalize();
    // +Z  → out of face toward camera  (right-hand rule: X × Y)
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
    // Re-orthogonalise Y (remove any drift from the X projection)
    _yAxis.crossVectors(_zAxis, _xAxis).normalize();

    _basis.makeBasis(_xAxis, _yAxis, _zAxis);
    _targetQuat.setFromRotationMatrix(_basis);

    // ── Position: above the forehead along the head's up axis ──────────
    const faceHeight = _vForehead.distanceTo(_vChin);
    _targetPos
      .copy(_vForehead)
      .addScaledVector(_yAxis, faceHeight * OFFSET_Y);

    // ── Scale: proportional to face height ─────────────────────────────
    hatGroup.scale.setScalar(faceHeight * SCALE_FACTOR);

    // ── Smooth to reduce jitter ─────────────────────────────────────────
    if (_firstFrame) {
      _smoothPos.copy(_targetPos);
      _smoothQuat.copy(_targetQuat);
      _firstFrame = false;
    } else {
      _smoothPos.lerp(_targetPos, 1 - SMOOTH_POS);
      _smoothQuat.slerp(_targetQuat, 1 - SMOOTH_ROT);
    }

    hatGroup.position.copy(_smoothPos);
    hatGroup.quaternion.copy(_smoothQuat);
    hatGroup.visible = true;
  };

  // ── XR scene setup ───────────────────────────────────────────────────────
  const initXrScene = ({ scene: s, camera: c, renderer }) => {
    scene  = s;
    camera = c;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping      = THREE.LinearToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    // Soft ambient fill
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // Key light: front-top (simulates selfie flash / ring light)
    const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
    keyLight.position.set(0, 3, 4);
    scene.add(keyLight);

    // Fill light: soft left side
    const fillLight = new THREE.DirectionalLight(0xe0f0ff, 0.5);
    fillLight.position.set(-4, 1, 2);
    scene.add(fillLight);

    // Rim light: subtle back-top for depth
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 4, -3);
    scene.add(rimLight);

    camera.position.set(0, 1.5, 0);

    loadModel()
      .then(() => initFaceLandmarker())
      .catch(err => console.error('Error loading somybarb.glb:', err));
  };

  return {
    name: 'rey-ar-scene',
    onStart: () => {
      const xr = XR8.Threejs.xrScene();
      initXrScene(xr);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });
    },
    onUpdate: () => {},
    onDetach: () => {
      // Stop MediaPipe loop
      faceLandmarker = null;
      if (hatGroup) { hatGroup.visible = false; }
      // Only release the camera stream if WE created it (not XR8's stream)
      if (ownedStream) {
        ownedStream.getTracks().forEach(t => t.stop());
        ownedStream = null;
        if (videoElement) { videoElement.srcObject = null; videoElement.remove(); }
      }
      videoElement = null;
    },
  };
};
