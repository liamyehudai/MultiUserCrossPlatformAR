# Co-Located Multi-User Cross-Platform Shared AR

> A static, serverless WebXR application built with Babylon.js that synchronizes 3D augmented reality animations across multiple co-located devices in real time using **deterministic time-based animation loops** and **optical image marker anchor alignment**.

---

## 🌟 Overview

**MultiUserCrossPlatformAR** demonstrates co-located Shared AR on a static website (hostable directly via GitHub Pages) without relying on WebRTC peer-to-peer data channels, WebSockets, or real-time signaling servers. 

By combining:
1. **Precision Network Time Synchronization (NTP-like algorithm)** to establish a unified global clock across all devices,
2. **WebXR Optical Image Tracking** to establish a shared $(0,0,0)$ spatial origin in physical space, and
3. **Closed-Form Mathematical Motion Functions** driven strictly by absolute synchronized timestamps $t$,

every participating device independently renders the identical 3D animation phase, position, rotation, particle effect, and HSL color state with sub-frame accuracy.

---

## 🚀 Key Features

* **Zero-Backend Shared AR Sync**: Eliminates infrastructure costs, server latency, and WebRTC pairing overhead by using mathematical determinism for state synchronization.
* **Network Clock Offset Compensation**: Computes local device clock drift relative to UTC server time using network Round-Trip Time (RTT) jitter filtering.
* **Spatial Marker Anchor Alignment**: Uses Babylon.js `WebXRImageTracking` to locate `marker.png` (20cm target width) and anchor the origin transform node (`markerRoot`) to the physical world.
* **Deterministic 3D Holographic Artifact**: Renders a complex polyhedral core, dual gyroscopic rings, orbiting tetrahedron satellites, and a high-density particle flare system.
* **iOS Platform Gating**: Automatically detects Mobile Safari on iOS/iPadOS and renders a dark-mode modal directing users to WebXR-enabled browsers (e.g., Mozilla WebXR Viewer) with one-touch URL copying.
* **Desktop & Non-AR Fallback**: Gracefully degrades to an interactive 3D orbit preview on desktop and non-AR browsers.
* **Custom AR Marker Generator**: Includes a standalone Python script (`generate_marker.py`) to generate asymmetric, high-contrast optical tracking target images.

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

```
MultiUserCrossPlatformAR/
├── index.html          # Minimal HTML5 entry point with WebXR & CSS links
├── style.css           # Glassmorphism design system & platform modal styles
├── app.js              # Platform gating, time sync, 3D scene, & WebXR tracking
├── marker.png          # High-contrast 512x512 optical tracking target
├── generate_marker.py  # Python script to regenerate custom AR tracking marker
└── README.md           # Project architecture and technical documentation
```

---

## 💻 Hardware & Browser Compatibility

| Platform / Device | Browser | WebXR AR Mode | Fallback / Behavior |
| :--- | :--- | :---: | :--- |
| **Android** | Google Chrome | ✅ Supported | Native Immersive WebXR AR + Image Tracking |
| **Meta Quest 2/3/Pro** | Meta Quest Browser | ✅ Supported | Native Pass-through WebXR AR |
| **iOS / iPadOS** | Mobile Safari | 📷 WebCam AR Mode | Live Rear-Camera Feed + Time-Synced Hologram |
| **Desktop PC / Mac** | Chrome / Firefox / Edge | ℹ️ Preview | Interactive 3D Orbit Camera Mode |

> 💡 **iOS & GitHub Pages Support**: Standard iOS Mobile Safari restricts native WebXR (`navigator.xr`). This application automatically detects iOS and activates **Live WebCam AR Mode** directly in Safari, using the rear camera stream and device orientation while maintaining 100% synchronized clock and animation phase across all devices!

---

## 🚦 Getting Started

### 1. Host or Serve the Project
Because WebXR requires a secure context (`https://`), host the project on **GitHub Pages** or run a local HTTPS server:

```bash
# Option 1: Python HTTP Server (Local development)
python3 -m http.server 8000
```
*(Note: To test WebXR on mobile devices, use HTTPS via ngrok, Cloudflare Tunnel, or host on GitHub Pages).*

### 2. Print or Display the Marker
1. Open the app on desktop or click **"📷 Display / Print AR Marker"** in the HUD.
2. Display `marker.png` on a secondary screen or print it on paper (target dimensions: 20cm x 20cm).

### 3. Launch Shared AR Session
1. Open the site URL on multiple WebXR-compatible mobile devices (Android Chrome or iOS WebXR browser).
2. Tap **"START AR"** (or point camera at the target marker).
3. Observe all devices rendering the exact same floating 3D holographic structure in synchronized phase in the same physical space.

---

## 🐍 Generating Custom Optical Markers

To modify or regenerate the high-contrast asymmetric optical tracking marker:

```bash
# Install dependencies
pip install Pillow

# Run marker generator script
python3 generate_marker.py
```

This updates `marker.png` with corner feature points and asymmetric geometric density for optimal WebXR tracking stability.

