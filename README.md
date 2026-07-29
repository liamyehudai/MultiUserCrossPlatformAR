# Co-Located Multi-User Cross-Platform Shared AR

> A static, serverless WebXR and WebCam AR application built with Babylon.js and JSARToolKit5 that synchronizes 3D augmented reality holograms across multiple co-located devices in real time using **deterministic time-based animation loops** and **optical fiducial marker tracking**.

---

## 🌟 Overview

**MultiUserCrossPlatformAR** demonstrates co-located Shared AR on a static website (hostable directly via GitHub Pages) without relying on WebRTC peer-to-peer data channels, WebSockets, or real-time signaling servers.

By combining:
1. **Precision Network Time Synchronization (NTP-like algorithm)** to establish a unified global clock across all devices,
2. **Dual-Engine Spatial Anchor Tracking**:
   - **Native WebXR Mode**: Uses WebXR Image Tracking API on Android Chrome, Quest, and VisionOS.
   - **Live WebCam AR Mode**: Uses **JSARToolKit5** (Emscripten WebAssembly ARToolKit v5 core) on iOS Mobile Safari and Brave.
3. **Closed-Form Mathematical Motion Functions** driven strictly by absolute synchronized timestamps $t$,

every participating device independently renders the identical 3D animation phase, position, rotation, particle effect, and HSL color state with sub-frame accuracy.

---

## 🚀 Key Features

* **Zero-Backend Shared AR Sync**: Eliminates infrastructure costs, server latency, and WebRTC pairing overhead by using mathematical determinism for state synchronization.
* **Dual-Engine Cross-Platform Support**:
  - **Native WebXR AR**: 6DOF passthrough with native hardware image tracking.
  - **iOS WebCam AR**: Full optical marker tracking on Mobile Safari & Brave using WebGL transparent alpha compositing.
* **Network Clock Offset Compensation**: Computes local device clock drift relative to UTC server time using network Round-Trip Time (RTT) jitter filtering.
* **Fiducial Printout Marker Scale Presets**: Supports configurable printout target marker scales (**10cm | 13cm (Default) | 15cm | 20cm**).
* **Deterministic 3D Holographic Artifact**: Renders a complex polyhedral core, dual gyroscopic rings, orbiting tetrahedron satellites, and a high-density particle flare system.
* **Comprehensive Diagnostic Telemetry Suite**:
  - **Real-Time Viewport Projection**: Calculates 2D screen coordinates and pixel render diameter.
  - **WebGL Hardware Pixel Sampler**: Uses `gl.readPixels()` to verify active 3D pixel rendering over the live camera feed.
  - **10-Sec Tracking Persistence Sparkline**: Displays a rolling frame-tracking persistence percentage and visual sparkline (`[████████████████████]`).
  - **10Hz High-Frequency Sensor & Pose Timeline**: Records 100 timestamped samples per 10-second test window (3D Pose $X,Y,Z$, 3D Rotation, Hardware Gyroscope $\alpha,\beta,\gamma$, and IMU Accelerometer $a_x,a_y,a_z$).
  - **iOS Safari Clipboard Exporter**: One-touch clipboard exporter with WebKit fallback for iOS Safari.

---

## 📐 Mathematical Formulation

### 1. Network Time Synchronization & Latency Compensation
To synchronize phase across devices, the application measures network latency and calculates the clock offset ($\Delta t$) between local device system time (`Date.now()`) and UTC server time:

$$\text{RTT} = t_{\text{end}} - t_{\text{start}}$$

$$\text{Latency} = \frac{\text{RTT}}{2}$$

$$t_{\text{server\_adjusted}} = t_{\text{server}} + \text{Latency}$$

$$\Delta t = t_{\text{server\_adjusted}} - t_{\text{end}}$$

The synchronized epoch time in seconds ($t$) at any instant is:

$$t = \frac{\text{Date.now()} + \Delta t}{1000.0}$$

### 2. Deterministic Animation Equations
All rendering logic inside `scene.onBeforeRenderObservable` uses $t$ as the sole parameter:

* **Central Core Harmonic Vertical Bobbing**:
  $$y_{\text{core}}(t) = 0.30 + \sin(2.2 \cdot t) \times 0.04 \quad \text{(meters)}$$

* **Central Core Rotation**:
  $$\text{Rotation}_Y = 1.4 \cdot t, \quad \text{Rotation}_X = \sin(0.7 \cdot t) \times 0.45$$

* **Gyroscopic Ring Counter-Rotations**:
  $$\text{Outer Ring}_X = 1.2 \cdot t, \quad \text{Outer Ring}_Z = 0.8 \cdot t$$
  $$\text{Inner Ring}_X = -1.8 \cdot t, \quad \text{Inner Ring}_Y = 1.1 \cdot t$$

* **Satellite Orbital Trajectories** (for $N=4$ satellites, index $i \in \{0,1,2,3\}$):
  $$\theta_i(t) = 2.0 \cdot t + \frac{2\pi \cdot i}{N}$$
  $$x_i(t) = R \cdot \cos(\theta_i(t)), \quad z_i(t) = R \cdot \sin(\theta_i(t)) \quad (R = 0.36\text{m})$$
  $$y_i(t) = 0.30 + \sin(3.0 \cdot t + i) \times 0.06$$

* **Synchronized HSL Color Cycle**:
  $$\text{Hue}(t) = \frac{(36.0 \cdot t) \bmod 360.0}{360.0}$$

---

## 🛠 Project Structure

```text
MultiUserCrossPlatformAR/
├── index.html          # HTML5 entry point with Babylon.js & JSARToolKit5 script tags
├── style.css           # Glassmorphism UI, status badges, and diagnostic modal styles
├── app.js              # Time sync, 3D scene, dual WebXR/JSARToolKit engine & telemetry
├── artoolkit.min.js    # JSARToolKit5 Emscripten WebAssembly computer vision library
├── camera_para.dat     # Intrinsic camera parameters matrix file for JSARToolKit5
├── marker.patt         # Compiled optical pattern template for pattern ID 0
├── marker.png          # High-contrast 512x512 printable optical tracking marker image
├── generate_marker.py  # Python script to regenerate custom AR tracking marker
└── README.md           # Technical architecture and documentation
```

---

## 💻 Hardware & Browser Compatibility

| Platform / Device | Browser | Tracking Mode | Engine / Behavior |
| :--- | :--- | :---: | :--- |
| **iOS / iPadOS** | Mobile Safari / Brave | 📷 **WebCam AR Mode** | **JSARToolKit5** WebAssembly optical marker tracking over live rear-camera stream |
| **Android** | Google Chrome | ✅ **Native WebXR AR** | Native Immersive WebXR AR + Image Tracking (ARCore) |
| **Meta Quest 2/3/Pro** | Meta Quest Browser | ✅ **Native WebXR AR** | Native Passthrough WebXR AR |
| **Desktop PC / Mac** | Chrome / Safari / Firefox | ℹ️ **Interactive Preview** | Orbit camera 3D preview |

---

## 📐 Measuring Printout Marker Size

When printing or displaying the optical marker, measure the **straight side length (Width or Height)** of the outer black square with a ruler (do **NOT** measure the diagonal/hypotenuse):

```text
    ┌───────────────────────────┐
    │     ◄── WIDTH (cm) ──►    │
    │   ┌───────────────────┐   │
    │   │  ■■■■■■■■■■■■■■   │   │ ▲
    │   │  ■   PATTERN   ■  │   │ HEIGHT (cm)
    │   │  ■■■■■■■■■■■■■■   │   │ ▼
    └───────────────────────────┘
```

Select the matching preset size button in the HUD:
- **10cm** (~3.9 in)
- **13cm (Default)** (~5.1 in)
- **15cm** (~5.9 in)
- **20cm** (~7.9 in)

---

## 🚦 Getting Started

### 1. Host or Serve the Project
Serve the project over HTTPS (or host directly via **GitHub Pages**):

```bash
# Local development server
python3 -m http.server 8000
```

### 2. Launch Session
1. Open the website URL on multiple devices (iPhone / Android / Desktop).
2. Tap **📷 START WEBCAM AR** (or **START WEBXR AR**).
3. Point the camera at the printed 13cm marker.
4. Observe all devices rendering the exact same floating 3D holographic structure in synchronized phase in the same physical space.
