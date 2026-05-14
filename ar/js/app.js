// App entry: splash -> mobile check -> 8th Wall AR (Android + iOS Safari).
import * as THREE from 'three';
import { initReyArScene }      from './ar.js';
import { initArPlacementScene } from './ar-placement.js';

// Expose THREE globally so 8th Wall's XR8.Threejs pipeline module can use it.
window.THREE = THREE;

const splash       = document.getElementById('splash');
const noMobile     = document.getElementById('no-mobile');
const arOverlay    = document.getElementById('ar-overlay');
const btnStart     = document.getElementById('btn-start');
const btnHome      = document.getElementById('btn-home');
const btnHomeSplash = document.getElementById('btn-home-splash');
const btnAudio     = document.getElementById('btn-audio');
const btnSwitch    = document.getElementById('btn-switch');
const btnPhoto     = document.getElementById('btn-photo');
const photoPreview = document.getElementById('photo-preview');
const photoImg     = document.getElementById('photo-img');
const photoClose   = document.getElementById('photo-close');
const hintEl       = document.getElementById('hint');
const modeLabel    = document.getElementById('mode-label');
const canvas       = document.getElementById('camerafeed');
const selfieLogoEl = document.getElementById('selfie-logo');
const btnShare     = document.getElementById('btn-share');

// Background music
let bgMusic        = null;
let musicPaused    = false;

function isMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
  const isIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return mobileRegex.test(ua) || isIpad;
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// ── Mode state ───────────────────────────────────────────────────────────────
// 'selfie' = front camera + face filter | 'ar' = back camera + model placement
const urlMode     = new URLSearchParams(location.search).get('mode');
let currentMode   = urlMode === 'selfie' ? 'selfie' : 'ar';
let arStarted     = false;
let isSwitching   = false;

const HINTS = {
  selfie: 'Selfie del REY — apunta tu cara a la cámara',
  ar:     'Modo RA — apunta al suelo y toca para colocar al Rey',
};

const SWITCH_LABELS = {
  selfie: '🌍 Modo RA',
  ar:     '🤳 Selfie REY',
};

function updateUI(mode) {
  hintEl.textContent     = HINTS[mode];
  hintEl.style.opacity  = ''; // Reset opacity when switching modes
  modeLabel.textContent  = mode === 'selfie' ? 'Selfie del REY' : 'Modo RA';
  // Logo always hidden in live view (only composited into captured photo)
  hide(selfieLogoEl);
  // Photo button: always in selfie, hidden in AR until model placed
  if (mode === 'selfie') {
    show(btnPhoto);
  } else {
    hide(btnPhoto);
  }
}

// ── Pipeline builders ────────────────────────────────────────────────────────
function buildPipeline(mode) {
  XR8.clearCameraPipelineModules();

  if (mode === 'selfie') {
    XR8.XrController.configure({ disableWorldTracking: true });
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      window.LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      XR8.CanvasScreenshot.pipelineModule(),
      initReyArScene({ selfieMode: true }),
    ]);
  } else {
    XR8.XrController.configure({ disableWorldTracking: false });
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      window.LandingPage.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      XR8.CanvasScreenshot.pipelineModule(),
      initArPlacementScene({
        onHintChange: (text) => { hintEl.textContent = text; },
        onPlaced: () => { show(btnPhoto); },
      }),
    ]);
  }
}

function runXR8(mode) {
  const dir = mode === 'selfie'
    ? XR8.XrConfig.camera().FRONT
    : XR8.XrConfig.camera().BACK;
  XR8.run({ canvas, cameraConfig: { direction: dir } });
}

// ── Background music ──────────────────────────────────────────────────────────
function playBackgroundMusic() {
  if (bgMusic) return;
  bgMusic = new Audio('assets/sound/white.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play().catch(err => console.log('Audio play failed (user interaction required):', err));
}

function stopBackgroundMusic() {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic = null;
  }
}

function pauseBackgroundMusic() {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.muted = true;
    musicPaused = true;
  }
}

function resumeBackgroundMusic() {
  if (bgMusic && musicPaused) {
    bgMusic.muted = false;
    bgMusic.play().catch(err => console.log('Audio resume failed:', err));
    musicPaused = false;
  }
}

// Pause audio when app is minimized/backgrounded
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseBackgroundMusic();
  } else {
    resumeBackgroundMusic();
  }
});

// Pause audio when page is hidden (mobile background)
window.addEventListener('pagehide', () => {
  pauseBackgroundMusic();
});

// Resume audio when page is shown (mobile foreground)
window.addEventListener('pageshow', () => {
  resumeBackgroundMusic();
});


// ── Start / switch ───────────────────────────────────────────────────────────
function startAR() {
  if (arStarted) return;
  arStarted = true;

  const onxrloaded = () => {
    buildPipeline(currentMode);
    runXR8(currentMode);
    updateUI(currentMode);
  };

  if (window.XR8) onxrloaded();
  else window.addEventListener('xrloaded', onxrloaded);
}

function switchMode() {
  if (isSwitching) return;
  isSwitching = true;
  btnSwitch.disabled = true;

  const nextMode = currentMode === 'selfie' ? 'ar' : 'selfie';

  try {
    XR8.stop();
  } catch (_) { /* ignore if already stopped */ }

  setTimeout(() => {
    currentMode = nextMode;
    buildPipeline(currentMode);
    runXR8(currentMode);
    updateUI(currentMode);
    isSwitching        = false;
    btnSwitch.disabled = false;
  }, 600);

  // Fallback: ensure button is re-enabled after 2 seconds
  setTimeout(() => {
    isSwitching        = false;
    btnSwitch.disabled = false;
  }, 2000);
}

// ── Event listeners ──────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (!isMobile()) {
    hide(splash);
    show(noMobile);
    return;
  }
  hide(splash);
  show(canvas);
  show(arOverlay);
  playBackgroundMusic(); // Play music on user interaction (click)
  startAR();
});

// Auto-start AR if returning from a mode switch (URL has ?mode=...)
if (urlMode) {
  if (!isMobile()) {
    show(noMobile);
  } else {
    hide(splash);
    show(canvas);
    show(arOverlay);
    playBackgroundMusic(); // Play music on auto-start
    startAR();
  }
}

btnHome.addEventListener('click', () => {
  stopBackgroundMusic();
  window.location.reload();
});

btnHomeSplash.addEventListener('click', () => {
  window.location.reload();
});

let audioMuted = false;
const iconAudio = document.getElementById('icon-audio');
btnAudio.addEventListener('click', () => {
  audioMuted = !audioMuted;
  if (bgMusic) bgMusic.muted = audioMuted;
  iconAudio.classList.toggle('muted', audioMuted);
});

btnSwitch.addEventListener('click', switchMode);

// ── Composite logo.png into a screenshot data URL ────────────────────────────
async function compositeLogoOnPhoto(photoDataUrl) {
  return new Promise((resolve) => {
    const photo = new Image();
    photo.onload = () => {
      const cv  = document.createElement('canvas');
      cv.width  = photo.width;
      cv.height = photo.height;
      const ctx = cv.getContext('2d');

      ctx.drawImage(photo, 0, 0);

      const logo = new Image();
      logo.onload = () => {
        const logoW = cv.width * 0.54;                   // 54% of photo width (matches live overlay)
        const logoH = logoW * (logo.height / logo.width);
        const logoX = (cv.width - logoW) / 2;            // centered
        const logoY = cv.height - logoH - cv.height * 0.04; // ~4% from bottom (matches live overlay)
        ctx.drawImage(logo, logoX, logoY, logoW, logoH);
        resolve(cv.toDataURL('image/jpeg', 0.92));
      };
      logo.onerror = () => resolve(photoDataUrl); // fallback if logo fails
      logo.src = 'assets/im/logo.png';
    };
    photo.onerror = () => resolve(photoDataUrl);
    photo.src = photoDataUrl;
  });
}

btnPhoto.addEventListener('click', async () => {
  if (!window.XR8 || !XR8.CanvasScreenshot) {
    console.error('XR8 or CanvasScreenshot not available');
    return;
  }
  btnPhoto.disabled = true;
  try {
    const data    = await XR8.CanvasScreenshot.takeScreenshot();
    if (!data) {
      console.error('Screenshot returned empty data');
      return;
    }
    const raw     = 'data:image/jpeg;base64,' + data;
    const dataUrl = await compositeLogoOnPhoto(raw);
    photoImg.src  = dataUrl;
    show(photoPreview);
  } catch (err) {
    console.error('Error tomando foto:', err);
    alert('Error al tomar la foto. Intenta de nuevo.');
  } finally {
    btnPhoto.disabled = false;
  }
});

photoClose.addEventListener('click', () => {
  hide(photoPreview);
  photoImg.src = '';
});

// ── Share photo ───────────────────────────────────────────────────────────────
btnShare.addEventListener('click', async () => {
  const dataUrl = photoImg.src;
  if (!dataUrl) return;

  try {
    const blob = await fetch(dataUrl).then(r => r.blob());
    const file = new File([blob], 'rey-ar.jpg', { type: 'image/jpeg' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: '¡Rey AR!',
        text: '¡Mira mi foto con el Rey AR!',
        files: [file],
      });
    } else if (navigator.share) {
      await navigator.share({
        title: '¡Rey AR!',
        text: '¡Mira mi foto con el Rey AR!',
        url: window.location.href,
      });
    } else {
      photoDownload.click();
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Error al compartir:', err);
  }
});

