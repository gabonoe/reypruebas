# Rey AR - 8th Wall + three.js

App WebAR que funciona en **Android Chrome** y **iOS Safari** usando **8th Wall Engine Binary** (open source, gratis, sin app key).

## Stack

- **8th Wall Engine Binary v1** (open source MIT + binary): SLAM / world tracking multiplataforma. Incluye iOS donde WebXR no existe.
- **three.js 0.160** via importmap.
- **GLTFLoader + DRACOLoader**: carga de `rey.glb` con compresion DRACO (decoder via gstatic CDN).
- **XRExtras**: loading screen, landing page, error handling.

## Caracteristicas

- Splash con `assets/im/splash.jpg` + boton **Comenzar**.
- Deteccion de movil: en escritorio muestra *"esta funcion solo esta disponible en dispositivos moviles"*.
- World tracking SLAM en Android e iOS (sin WebXR, sin USDZ, el mismo GLB sirve).
- Reticulo circular en el piso (raycast continuo al centro de pantalla).
- Tap para colocar, arrastrar para mover, dos dedos para recenter.
- Iluminacion basica (ambient + directional). 8th Wall no expone light-estimation en open source, pero el modelo se ve con iluminacion neutra.

## Requisitos

- HTTPS en movil (o localhost).
- Android: Chrome, Samsung Internet, etc.
- iOS: Safari (Chrome/Firefox iOS 14.3+ tambien funcionan porque usan WKWebView).

## Estructura

```
AR/
  index.html           # splash + canvas + scripts 8th Wall
  styles.css
  js/
    app.js             # flujo splash -> mobile check -> XR8.run
    ar.js              # pipeline module custom (scene, raycast, touch)
  assets/
    im/splash.jpg
    3D/rey.glb         # modelo con DRACO
  convert.html         # (opcional) generador USDZ - ya no necesario
```

## Como ejecutar

### Local (splash en escritorio, sin AR)

```powershell
npx serve -l 8000 .
```

Abre `http://localhost:8000`.

### En movil real (AR)

Necesitas HTTPS. Usa ngrok:

```powershell
npx serve -l 8000 .
# en otra terminal
ngrok http 8000
```

Abre la URL `https://...ngrok...` en Chrome Android o Safari iOS.

## Notas de 8th Wall open source

- El engine binary se carga desde `https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js`.
- La licencia del binary permite uso comercial (ver `https://8thwall.org`).
- Todo lo demas (xrextras, landing-page) es MIT.
- Si prefieres autohospedar: `npm install @8thwall/engine-binary @8thwall/xrextras @8thwall/landing-page` y sirve `node_modules/.../dist/*.js` desde tu propio dominio.

## Detalles tecnicos

- `window.THREE = THREE` se setea en `js/app.js` antes de que XR8 se inicialice, para que `XR8.Threejs.pipelineModule()` pueda construir la escena con nuestra version de three.
- El raycast se hace contra un plano invisible a `y=0`. La camara inicial se coloca a `y=1.5` (altura de telefono tipica), y SLAM ajusta desde ahi.
- DRACO decoder desde `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`.
