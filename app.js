/**
 * ============================================================================
 * Co-Located Shared AR — Babylon.js WebXR Main Application
 * ============================================================================
 * Architecture Overview:
 * 1. iOS Platform Gating: Halts WebXR on iOS Safari and prompts for WebXR browsers.
 * 2. Time Synchronization: Computes clock offset between local device and UTC server
 *    with network Round-Trip Time (RTT) latency compensation.
 * 3. Babylon.js 3D Engine Setup: Initializes scene, lighting, and materials.
 * 4. WebXR Image Tracking: Uses marker.png as the shared (0,0,0) spatial anchor.
 * 5. Deterministic Animation Loop: Updates 3D mesh transforms, rotations, and HSL
 *    colors purely based on absolute synchronized timestamp (t = (Date.now() + offset)/1000),
 *    ensuring identical visual phase across all co-located devices without WebRTC/sockets.
 * ============================================================================
 */

(function () {
    'use strict';

    // Diagnostic Console Log Buffer for debugging WebXR on Meta Quest & mobile devices
    const logBuffer = [];
    
    function captureLog(type, args) {
        const message = args.map(arg => {
            if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}\n${arg.stack}`;
            } else if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        logBuffer.push({
            timestamp: new Date().toLocaleTimeString(),
            type: type,
            message: message
        });

        // Keep last 150 log messages
        if (logBuffer.length > 150) {
            logBuffer.shift();
        }

        // Live-update log display if currently visible
        updateLogConsoleDisplay();
        updateLogBadgeUI();
    }

    // Intercept default console logging to pipe into our system diagnostic buffer
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog.apply(console, args);
        captureLog('info', args);
    };
    console.warn = (...args) => {
        originalWarn.apply(console, args);
        captureLog('warn', args);
    };
    console.error = (...args) => {
        originalError.apply(console, args);
        captureLog('error', args);
    };

    // Catch unhandled exceptions and promise rejections
    window.addEventListener('error', (event) => {
        if (event.message && String(event.message).includes('__gCrWeb')) return;
        captureLog('error', [event.error || event.message]);
    });
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && String(event.reason).includes('__gCrWeb')) return;
        captureLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    });

    // Application State Variables
    let timeOffset = 0;           // Milliseconds to add to Date.now()
    let timeSyncLatency = 0;      // Network Round-Trip Time in ms
    let isTimeSynced = false;
    let engine = null;
    let scene = null;
    let markerRoot = null;
    let glowMaterial = null;
    let innerRingMat = null;
    let centralCore = null;
    let outerRing = null;
    let innerRing = null;
    let satellites = [];
    let xrExperience = null;
    let isTrackingActive = false;

    // DOM Element References
    const canvas = document.getElementById('renderCanvas');
    const uiContainer = document.getElementById('uiContainer');

    /**
     * ============================================================================
     * SECTION 1: Platform Capability & iOS Support Handling
     * ============================================================================
     * Apple WebKit restricts standard native WebXR API (`immersive-ar`) on Mobile Safari.
     * To provide full AR functionality on iOS via static GitHub Pages:
     * 1. On Android / WebXR-capable browsers: Native WebXR Immersive AR + Image Tracking.
     * 2. On iOS Safari / Non-XR browsers: Live WebCam AR Mode (getUserMedia + Camera Feed + Gyroscope)
     *    with 100% deterministic time-synchronized 3D holograms.
     */
    function isIOSDevice() {
        const userAgent = window.navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        const isIPadOS = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return isIOS || isIPadOS;
    }

    function isWebXRSupportedOrBypassed() {
        // 1. Check for explicit URL query parameter bypass (?xr=1, ?bypass=1)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('xr') || urlParams.has('bypass') || urlParams.has('bypass_ios')) {
            return true;
        }

        // 2. Check for session storage bypass flag
        if (sessionStorage.getItem('bypass_ios_xr_check') === 'true') {
            return true;
        }

        // 3. Check for WebXR API availability
        if ('xr' in navigator && navigator.xr) {
            return true;
        }
        if (window.WebXR || window.WebXRPolyfill) {
            return true;
        }

        return false;
    }

    async function checkShouldShowIOSNotice() {
        if (!isIOSDevice()) {
            return false; // Non-iOS device
        }

        if (sessionStorage.getItem('ios_notice_dismissed') === 'true') {
            return false; // User already acknowledged notice
        }

        // Probing for native immersive-ar support
        if ('xr' in navigator && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                if (supported) return false;
            } catch (e) {
                console.warn("Error probing WebXR session support:", e);
            }
        }

        return true; // iOS Safari device
    }

    function renderIOSNoticeUI(onProceedCallback) {
        uiContainer.innerHTML = `
            <div class="modal-overlay" id="iosModal">
                <div class="ios-card">
                    <div class="ios-icon" style="background: rgba(0, 240, 255, 0.15); border-color: rgba(0, 240, 255, 0.4); color: var(--accent-cyan);">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-10h2v8h-2V6z"/>
                        </svg>
                    </div>
                    <h2>iOS Shared AR Support</h2>
                    <p>
                        Apple Mobile Safari restricts native WebXR APIs, but this application includes a <strong>Live WebCam AR Mode</strong> designed for iOS!
                    </p>
                    <div class="ios-instructions">
                        <strong>Features on iOS Safari:</strong>
                        <ul>
                            <li>📷 Live rear-camera overlay directly in Safari</li>
                            <li>⏱️ Sub-frame UTC time-synchronized 3D holograms</li>
                            <li>🔄 Identical animation phase synced with Android & Quest devices</li>
                        </ul>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
                        <button class="btn-primary" id="startWebcamDirectBtn">
                            📷 Launch Live WebCam AR Mode
                        </button>
                        <button class="btn-secondary" id="previewModeBtn">
                            🌐 Enter 3D Orbit Preview Mode
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('startWebcamDirectBtn')?.addEventListener('click', () => {
            requestDeviceOrientationPermission();
            sessionStorage.setItem('ios_notice_dismissed', 'true');
            uiContainer.innerHTML = '';
            if (typeof onProceedCallback === 'function') {
                onProceedCallback(true); // Launch WebCam AR
            }
        });

        document.getElementById('previewModeBtn')?.addEventListener('click', () => {
            requestDeviceOrientationPermission();
            sessionStorage.setItem('ios_notice_dismissed', 'true');
            uiContainer.innerHTML = '';
            if (typeof onProceedCallback === 'function') {
                onProceedCallback(false); // Fallback Preview Mode
            }
        });
    }

    function requestDeviceOrientationPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(response => {
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                }
            }).catch(e => {
                // Ignore if user dismisses prompt
            });
        } else if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        }
    }

    /**
     * ============================================================================
     * SECTION 2: Network Time Synchronization & Math
     * ============================================================================
     * Math Formulation:
     * t_start = local timestamp before request
     * t_end   = local timestamp after response
     * RTT     = t_end - t_start
     * Latency = RTT / 2
     * Adjusted Server Time = Server UTC + Latency
     * timeOffset = Adjusted Server Time - t_end
     * Synchronized Epoch Seconds (t) = (Date.now() + timeOffset) / 1000.0
     */
    async function synchronizeClock() {
        let minRTT = Infinity;
        let selectedOffset = 0;
        let syncMethod = '';

        // 1. Primary: Same-Origin HTTP Date Header (Fastest & 100% reliable without CORS issues)
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                const tStart = Date.now();
                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                const tEnd = Date.now();
                const serverDateStr = response.headers.get('date');

                if (serverDateStr) {
                    const rtt = tEnd - tStart;
                    const serverTimeMs = new Date(serverDateStr).getTime() + (rtt / 2.0);
                    const offset = serverTimeMs - tEnd;

                    if (rtt < minRTT) {
                        minRTT = rtt;
                        selectedOffset = offset;
                        syncMethod = 'HTTP Date Header';
                    }
                }
            }
        } catch (sameOriginErr) {
            // Same-origin fetch might fail on file:// protocol
        }

        // 2. Secondary Fallback: Third-party World Time APIs (silently try if same-origin is unavailable)
        if (minRTT === Infinity) {
            const endpoints = [
                'https://worldtimeapi.org/api/timezone/Etc/UTC',
                'https://timeapi.io/api/v1/time/current/zone?timeZone=UTC'
            ];

            for (const url of endpoints) {
                try {
                    const tStart = Date.now();
                    const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
                    if (!response.ok) continue;

                    const data = await response.json();
                    const tEnd = Date.now();
                    const rtt = tEnd - tStart;

                    let serverTimeMs = null;
                    if (data.unixtime) {
                        serverTimeMs = data.unixtime * 1000;
                    } else if (data.dateTime || data.utc_datetime) {
                        serverTimeMs = new Date(data.dateTime || data.utc_datetime).getTime();
                    } else if (data.milliSeconds) {
                        serverTimeMs = data.milliSeconds;
                    }

                    if (serverTimeMs !== null && rtt < minRTT) {
                        minRTT = rtt;
                        const latency = rtt / 2.0;
                        selectedOffset = (serverTimeMs + latency) - tEnd;
                        syncMethod = `API (${new URL(url).hostname})`;
                        break;
                    }
                } catch (err) {
                    // Suppress per-endpoint console warnings when CORS/network fails
                }
            }
        }

        if (minRTT !== Infinity) {
            timeOffset = Math.round(selectedOffset);
            timeSyncLatency = Math.round(minRTT);
            isTimeSynced = true;
            console.log(`Clock synchronized via ${syncMethod}. Offset: ${timeOffset}ms, RTT: ${timeSyncLatency}ms`);
        } else {
            console.warn("Time synchronization unavailable. Defaulting to local device clock.");
            timeOffset = 0;
            timeSyncLatency = 0;
            isTimeSynced = false;
        }
        updateTimeSyncHUD();
    }

    /**
     * Calculates current absolute synchronized epoch time in seconds.
     * @returns {number} Seconds since Unix Epoch (UTC)
     */
    function getSyncedTimeSeconds() {
        return (Date.now() + timeOffset) / 1000.0;
    }

    /**
     * Converts HSL color values to RGB color object.
     * @param {number} h Hue [0, 1]
     * @param {number} s Saturation [0, 1]
     * @param {number} l Lightness [0, 1]
     */
    function hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r, g, b };
    }

    /**
     * ============================================================================
     * SECTION 3: Babylon.js 3D Scene & Synchronized Content Setup
     * ============================================================================
     */
    function createScene() {
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1.0);

        // Fallback / Preview Camera (for non-AR desktop mode)
        const camera = new BABYLON.ArcRotateCamera(
            "previewCamera",
            -Math.PI / 4,
            Math.PI / 3,
            2.5,
            new BABYLON.Vector3(0, 0.3, 0),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 0.8;
        camera.upperRadiusLimit = 6.0;

        // Hemispheric & Directional Lights
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
        hemiLight.intensity = 0.6;
        hemiLight.diffuse = new BABYLON.Color3(0.8, 0.9, 1.0);

        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.position = new BABYLON.Vector3(2, 4, 2);
        dirLight.intensity = 0.8;

        // Master Spatial Anchor Node (Origin (0,0,0) attached to detected marker)
        markerRoot = new BABYLON.TransformNode("markerRoot", scene);

        // Grid Base Plane anchored at marker
        const gridGround = BABYLON.MeshBuilder.CreateGround("gridGround", { width: 0.8, height: 0.8 }, scene);
        gridGround.parent = markerRoot;
        const gridMat = new BABYLON.StandardMaterial("gridMat", scene);
        gridMat.wireframe = true;
        gridMat.emissiveColor = new BABYLON.Color3(0.0, 0.6, 0.8);
        gridMat.alpha = 0.4;
        gridGround.material = gridMat;

        // Materials for Synchronized 3D Artifacts
        glowMaterial = new BABYLON.StandardMaterial("glowMat", scene);
        glowMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        glowMaterial.emissiveColor = new BABYLON.Color3(0.0, 0.9, 1.0);
        glowMaterial.specularColor = new BABYLON.Color3(1, 1, 1);

        innerRingMat = new BABYLON.StandardMaterial("innerRingMat", scene);
        innerRingMat.emissiveColor = new BABYLON.Color3(1.0, 0.0, 0.4);
        innerRingMat.wireframe = true;

        // Central Polyhedral Monolith Core
        centralCore = BABYLON.MeshBuilder.CreatePolyhedron(
            "centralCore",
            { type: 1, size: 0.14 }, // Octahedron geometry
            scene
        );
        centralCore.parent = markerRoot;
        centralCore.position.y = 0.3;
        centralCore.material = glowMaterial;

        // Outer Gyroscope Ring
        outerRing = BABYLON.MeshBuilder.CreateTorus(
            "outerRing",
            { diameter: 0.45, thickness: 0.012, tessellation: 64 },
            scene
        );
        outerRing.parent = markerRoot;
        outerRing.position.y = 0.3;
        outerRing.material = glowMaterial;

        // Inner Gyroscope Ring
        innerRing = BABYLON.MeshBuilder.CreateTorus(
            "innerRing",
            { diameter: 0.32, thickness: 0.008, tessellation: 48 },
            scene
        );
        innerRing.parent = markerRoot;
        innerRing.position.y = 0.3;
        innerRing.material = innerRingMat;

        // Orbiting Satellite Spheres (4 Nodes)
        satellites = [];
        const numSatellites = 4;
        for (let i = 0; i < numSatellites; i++) {
            const sat = BABYLON.MeshBuilder.CreatePolyhedron(
                `sat_${i}`,
                { type: 0, size: 0.04 }, // Tetrahedron
                scene
            );
            sat.parent = markerRoot;
            sat.material = glowMaterial;
            satellites.push(sat);
        }

        // Particle System Swirling Around Anchor
        const particleSystem = new BABYLON.ParticleSystem("particles", 200, scene);
        particleSystem.particleTexture = new BABYLON.Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );
        particleSystem.emitter = centralCore;
        particleSystem.minEmitBox = new BABYLON.Vector3(-0.1, -0.1, -0.1);
        particleSystem.maxEmitBox = new BABYLON.Vector3(0.1, 0.1, 0.1);
        particleSystem.color1 = new BABYLON.Color4(0, 0.9, 1, 0.8);
        particleSystem.color2 = new BABYLON.Color4(1, 0, 0.5, 0.8);
        particleSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
        particleSystem.minSize = 0.01;
        particleSystem.maxSize = 0.035;
        particleSystem.minLifeTime = 0.8;
        particleSystem.maxLifeTime = 1.5;
        particleSystem.emitRate = 40;
        particleSystem.gravity = new BABYLON.Vector3(0, 0.05, 0);
        particleSystem.start();

        /**
         * ============================================================================
         * SECTION 4: Deterministic Animation Loop Math
         * ============================================================================
         * All transformation equations take absolute time 't' (in seconds) as input.
         * Since 't' is synchronized via UTC server offset, phase state is IDENTICAL on
         * all devices regardless of frame rate or when the AR session was launched.
         */
        scene.onBeforeRenderObservable.add(() => {
            const t = getSyncedTimeSeconds();

            // 1. Central Core Rotation & Floating Bobbing Motion
            if (centralCore) {
                // Rotation Y & X
                centralCore.rotation.y = t * 1.4;
                centralCore.rotation.x = Math.sin(t * 0.7) * 0.45;
                // Harmonic Y Bobbing: amplitude = 0.04m, frequency = 2.2 rad/s
                centralCore.position.y = 0.30 + Math.sin(t * 2.2) * 0.04;
            }

            // 2. Gyroscope Rings Rotation Equations
            if (outerRing) {
                outerRing.position.y = 0.30 + Math.sin(t * 2.2) * 0.04;
                outerRing.rotation.x = t * 1.2;
                outerRing.rotation.z = t * 0.8;
            }

            if (innerRing) {
                innerRing.position.y = 0.30 + Math.sin(t * 2.2) * 0.04;
                innerRing.rotation.x = -t * 1.8;
                innerRing.rotation.y = t * 1.1;
            }

            // 3. Orbiting Satellite Satellites Equations
            // Radial orbital equation: angle = t * speed + (2 * PI * i / N)
            const numSats = satellites.length;
            const orbitRadius = 0.36;
            satellites.forEach((sat, i) => {
                const phaseOffset = (2 * Math.PI * i) / numSats;
                const angle = (t * 2.0) + phaseOffset;
                
                // Orbit XZ position
                sat.position.x = Math.cos(angle) * orbitRadius;
                sat.position.z = Math.sin(angle) * orbitRadius;
                // Undulating Y position
                sat.position.y = 0.30 + Math.sin(t * 3.0 + i) * 0.06;
                // Spin on self
                sat.rotation.y = t * 3.5;
                sat.rotation.z = t * 2.1;
            });

            // 4. Synchronized HSL Color Cycle
            // Color Hue completes full 360-degree rotation every 10 seconds
            const hue = ((t * 36.0) % 360.0) / 360.0;
            const primaryRgb = hslToRgb(hue, 0.95, 0.55);
            const secondaryRgb = hslToRgb((hue + 0.5) % 1.0, 0.95, 0.55);

            if (glowMaterial) {
                glowMaterial.emissiveColor.set(primaryRgb.r, primaryRgb.g, primaryRgb.b);
            }
            if (innerRingMat) {
                innerRingMat.emissiveColor.set(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b);
            }

            // 5. Process optical marker computer vision tracking for WebCam AR Mode (iOS)
            processOpticalMarkerFrame();
        });

        return scene;
    }

    /**
     * ============================================================================
     * SECTION 5: Dual-Engine AR Setup (WebXR Native + JSARToolKit5 WebCam AR)
     * ============================================================================
     */
    let isWebcamARActive = false;
    let webcamStream = null;
    let arController = null;
    let trackedMarkerId = null;
    let isMarkerTrackedInWebcam = false;

    async function ensureARToolKitReady() {
        if (window.artoolkit && window.artoolkit.setup && window.ARController) {
            return true;
        }

        return new Promise((resolve) => {
            const onLoaded = () => {
                window.removeEventListener('artoolkit-loaded', onLoaded);
                resolve(true);
            };
            window.addEventListener('artoolkit-loaded', onLoaded);

            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                if (window.artoolkit && window.artoolkit.setup && window.ARController) {
                    clearInterval(timer);
                    window.removeEventListener('artoolkit-loaded', onLoaded);
                    resolve(true);
                } else if (attempts > 50) {
                    clearInterval(timer);
                    window.removeEventListener('artoolkit-loaded', onLoaded);
                    resolve(false);
                }
            }, 100);
        });
    }

    async function initOpticalMarkerTracking() {
        console.log("Waiting for JSARToolKit5 Emscripten engine initialization...");
        const ready = await ensureARToolKitReady();
        if (!ready || typeof window.ARCameraParam === 'undefined' || typeof window.ARController === 'undefined') {
            console.warn("JSARToolKit5 engine failed to initialize. Running camera view without optical marker tracking.");
            return;
        }

        const videoElem = document.getElementById('webcamVideoBg');
        if (!videoElem) return;

        // Wait for live video element dimensions to be ready
        let retry = 0;
        while ((!videoElem.videoWidth || !videoElem.videoHeight) && retry < 60) {
            await new Promise(r => setTimeout(r, 50));
            retry++;
        }

        try {
            console.log(`Video dimensions ready: ${videoElem.videoWidth}x${videoElem.videoHeight}. Pre-fetching camera parameters...`);
            
            // Pre-fetch camera parameter file to Uint8Array to bypass XMLHttpRequest issues
            const cameraRes = await fetch('camera_para.dat');
            if (!cameraRes.ok) throw new Error("Failed to fetch camera_para.dat: " + cameraRes.status);
            const cameraBuf = new Uint8Array(await cameraRes.arrayBuffer());

            let cameraParam = null;
            const onLoadCallback = function() {
                const paramInstance = this || cameraParam;
                const w = videoElem.videoWidth || 640;
                const h = videoElem.videoHeight || 480;

                console.log(`Creating ARController with dimensions ${w}x${h}...`);
                arController = new window.ARController(w, h, paramInstance);
                if (window.artoolkit && window.artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_COLOR !== undefined) {
                    arController.setPatternDetectionMode(window.artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_COLOR);
                } else if (window.artoolkit && window.artoolkit.AR_TEMPLATE_MATCHING_COLOR !== undefined) {
                    arController.setPatternDetectionMode(window.artoolkit.AR_TEMPLATE_MATCHING_COLOR);
                }

                console.log("Loading optical marker pattern file (marker.patt)...");
                arController.loadMarker('marker.patt', function(markerId) {
                    trackedMarkerId = markerId;
                    console.log("ARToolKit marker.patt successfully loaded with ID:", markerId);
                    updateTrackingStatusBadge("Point Camera at Marker...", "searching");
                });
            };

            cameraParam = new window.ARCameraParam(
                cameraBuf,
                onLoadCallback,
                function(err) {
                    console.error("Error loading ARCameraParam:", err);
                }
            );
        } catch (e) {
            console.warn("Failed to initialize ARToolKit optical tracker:", e);
            captureLog('warn', ["ARToolKit init error: " + (e.message || e)]);
        }
    }

    function processOpticalMarkerFrame() {
        if (!isWebcamARActive || !arController) return;

        const videoElem = document.getElementById('webcamVideoBg');
        if (!videoElem || videoElem.readyState < 2) return;

        try {
            arController.process(videoElem);
            const markerNum = arController.getMarkerNum();
            let foundMarker = false;

            for (let i = 0; i < markerNum; i++) {
                const markerInfo = arController.getMarker(i);
                if (trackedMarkerId !== null && (markerInfo.idPatt === trackedMarkerId || markerInfo.id === trackedMarkerId || (markerInfo.idPatt !== undefined && markerInfo.idPatt >= 0))) {
                    // Extract 3D transformation matrix for 20cm target marker
                    const markerMatrix = new Float32Array(12);
                    arController.getTransMatSquare(i, 0.2, markerMatrix);

                    const glMatrix = new Float32Array(16);
                    arController.transMatToGLMat(markerMatrix, glMatrix);

                    const bjsMatrix = BABYLON.Matrix.FromArray(glMatrix);

                    bjsMatrix.decompose(
                        markerRoot.scaling,
                        markerRoot.rotationQuaternion || (markerRoot.rotationQuaternion = new BABYLON.Quaternion()),
                        markerRoot.position
                    );

                    // Adjust Z depth for Babylon camera coordinate space
                    markerRoot.position.z = Math.abs(markerRoot.position.z);

                    markerRoot.setEnabled(true);
                    foundMarker = true;
                    isMarkerTrackedInWebcam = true;
                    updateTrackingStatusBadge("Marker Tracked — Synced AR Active", "synced");
                    break;
                }
            }

            if (!foundMarker && isMarkerTrackedInWebcam) {
                updateTrackingStatusBadge("Searching for Optical Marker...", "searching");
            }
        } catch (err) {
            // Ignore frame processing jitter
        }
    }

    async function setupWebXR() {
        let isSupported = false;

        if ('xr' in navigator && navigator.xr && typeof BABYLON.WebXRSessionManager.IsSessionSupportedAsync === 'function') {
            try {
                isSupported = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
            } catch (err) {
                console.warn("WebXR session check error:", err);
                isSupported = false;
            }
        }

        if (!isSupported) {
            console.log("Native WebXR immersive-ar is not supported on this browser/device. Ready for Optical WebCam AR Mode.");
            renderMainHUD(false, false);
            return;
        }

        try {
            xrExperience = await scene.createDefaultXRExperienceAsync({
                disableDefaultUI: true,
                uiOptions: {
                    sessionMode: 'immersive-ar',
                    referenceSpaceType: 'local-floor',
                    optionalFeatures: true
                },
                optionalFeatures: true
            });

            const fm = xrExperience.baseExperience.featuresManager;
            let imageTracking = null;

            try {
                imageTracking = fm.enableFeature(
                    BABYLON.WebXRFeatureName.IMAGE_TRACKING,
                    'latest',
                    {
                        images: [
                            {
                                src: 'marker.png',
                                estimatedRealWorldWidth: 0.2
                            }
                        ]
                    },
                    true, // attachIfPossible
                    false // required = false (Set as optional feature to prevent requestSession rejection on Meta Quest)
                );
                console.log("WebXR Image Tracking module successfully enabled.");
            } catch (imageTrackingErr) {
                console.warn(
                    "WebXR Image Tracking not supported on this device. Falling back to default WebXR placement.",
                    imageTrackingErr
                );
            }

            xrExperience.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    const isImageTrackingAttached = imageTracking && imageTracking.attached;
                    if (isImageTrackingAttached) {
                        markerRoot.setEnabled(false);
                        updateTrackingStatusBadge("Searching for Marker...", "searching");
                    } else {
                        markerRoot.setEnabled(true);
                        const cameraPosition = xrExperience.baseExperience.camera.position;
                        const direction = xrExperience.baseExperience.camera.getForwardRay().direction;
                        markerRoot.position.copyFrom(cameraPosition).addInPlace(direction.scale(1.2));
                        markerRoot.rotation.y = Math.atan2(direction.x, direction.z);
                        updateTrackingStatusBadge("Native WebXR Active", "synced");
                    }
                    const startArBtn = document.getElementById('startArBtn');
                    if (startArBtn) startArBtn.style.display = 'none';
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    markerRoot.setEnabled(true);
                    isTrackingActive = false;
                    updateTrackingStatusBadge("AR Session Ended", "");
                    const startArBtn = document.getElementById('startArBtn');
                    if (startArBtn) startArBtn.style.display = 'flex';
                }
            });

            if (imageTracking) {
                imageTracking.onTrackedImageUpdatedObservable.add((trackedImage) => {
                    if (!imageTracking.attached) return;

                    if (trackedImage && trackedImage.transformationMatrix) {
                        trackedImage.transformationMatrix.decompose(
                            markerRoot.scaling,
                            markerRoot.rotationQuaternion || (markerRoot.rotationQuaternion = new BABYLON.Quaternion()),
                            markerRoot.position
                        );
                        
                        markerRoot.setEnabled(true);
                        isTrackingActive = true;
                        updateTrackingStatusBadge("Marker Tracked — Synced AR Active", "synced");
                    }
                });
            }

            renderMainHUD(true, false);

        } catch (err) {
            console.error("Failed to initialize WebXR Experience:", err);
            renderMainHUD(false, false);
        }
    }

    /**
     * WebCam AR Mode for iOS Safari & browsers without native WebXR immersive-ar
     */
    async function startWebCamAR() {
        // Request DeviceOrientation for gyro motion on iOS fallback within user gesture turn
        requestDeviceOrientationPermission();

        try {
            console.log("Initializing WebCam AR Mode (iOS & WebAR)...");
            
            const constraints = {
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            webcamStream = await navigator.mediaDevices.getUserMedia(constraints);

            let videoElem = document.getElementById('webcamVideoBg');
            if (!videoElem) {
                videoElem = document.createElement('video');
                videoElem.id = 'webcamVideoBg';
                videoElem.setAttribute('autoplay', '');
                videoElem.setAttribute('muted', '');
                videoElem.setAttribute('playsinline', '');
                videoElem.style.position = 'fixed';
                videoElem.style.top = '0';
                videoElem.style.left = '0';
                videoElem.style.width = '100vw';
                videoElem.style.height = '100vh';
                videoElem.style.objectFit = 'cover';
                videoElem.style.zIndex = '0';
                document.body.insertBefore(videoElem, canvas);
            }
            videoElem.srcObject = webcamStream;
            await videoElem.play();

            // Set canvas transparent over live video
            canvas.style.backgroundColor = 'transparent';
            canvas.style.position = 'absolute';
            canvas.style.zIndex = '1';
            if (scene) scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

            // Initial positioning for 3D hologram anchor
            markerRoot.setEnabled(true);
            markerRoot.position.set(0, -0.15, 1.2);

            // Initialize JSARToolKit5 optical marker tracking
            initOpticalMarkerTracking();

            isWebcamARActive = true;
            updateTrackingStatusBadge("Live WebCam AR Active (Searching Marker)", "searching");

            renderMainHUD(false, true);

        } catch (err) {
            console.error("Failed to launch WebCam AR:", err);
            captureLog('error', ["WebCam AR Error: " + (err.message || err)]);
            alert("Unable to access camera. Please ensure camera access is enabled in Safari settings.");
        }
    }

    function stopWebCamAR() {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        const videoElem = document.getElementById('webcamVideoBg');
        if (videoElem) videoElem.remove();

        if (arController) {
            try { arController.dispose(); } catch (e) {}
            arController = null;
        }
        trackedMarkerId = null;
        isMarkerTrackedInWebcam = false;

        canvas.style.backgroundColor = '';
        if (scene) scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1.0);
        isWebcamARActive = false;

        window.removeEventListener('deviceorientation', handleDeviceOrientation, true);

        updateTrackingStatusBadge("3D Orbit Preview Mode", "");
        renderMainHUD(false, false);
    }

    function handleDeviceOrientation(event) {
        if (!isWebcamARActive || !scene || !scene.activeCamera) return;
        if (event.beta !== null && event.gamma !== null) {
            const pitch = BABYLON.Tools.ToRadians(event.beta - 45);
            const roll = BABYLON.Tools.ToRadians(event.gamma);
            scene.activeCamera.alpha = -Math.PI / 2 + roll * 0.4;
            scene.activeCamera.beta = Math.PI / 3 + pitch * 0.3;
        }
    }

    /**
     * ============================================================================
     * SECTION 6: UI Rendering & User Interaction Handlers
     * ============================================================================
     */
    function renderMainHUD(arSupported, webcamActive = isWebcamARActive) {
        const isIOS = isIOSDevice();
        let badgeText = '3D Preview Mode';
        let badgeClass = 'synced';
        if (arSupported) {
            badgeText = 'Native WebXR Ready';
            badgeClass = 'searching';
        } else if (webcamActive) {
            badgeText = 'Live WebCam AR Active';
            badgeClass = 'synced';
        } else if (isIOS) {
            badgeText = 'iOS WebCam AR Ready';
            badgeClass = 'searching';
        }

        uiContainer.innerHTML = `
            <div class="hud-header">
                <div class="hud-badge-row">
                    <div class="status-badge" id="trackingStatus">
                        <span class="status-dot ${badgeClass}" id="statusDot"></span>
                        <span id="statusText">${badgeText}</span>
                    </div>
                </div>

                <div class="time-sync-card">
                    <div>Clock Sync Offset: <span class="val" id="offsetVal">${timeOffset > 0 ? '+' : ''}${timeOffset} ms</span></div>
                    <div>Network RTT: <span class="val" id="rttVal">${timeSyncLatency} ms</span></div>
                </div>
            </div>

            <div class="hud-footer">
                ${arSupported ? `
                    <button class="btn-primary" id="startArBtn" style="margin-bottom: 8px;">
                        <svg style="width: 20px; height: 20px; fill: currentColor; margin-right: 6px;" viewBox="0 0 24 24">
                            <path d="M21 4.5H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-11c0-1.1-.9-2-2-2zM7.5 14c-1.38 0-2.5-1.12-2.5-2.5S6.12 9 7.5 9s2.5 1.12 2.5 2.5S8.88 14 7.5 14zm9 0c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        START WEBXR AR
                    </button>
                ` : `
                    <button class="btn-primary" id="startArBtn" style="margin-bottom: 8px; ${webcamActive ? 'background: linear-gradient(135deg, #FF0055 0%, #FF5500 100%);' : ''}">
                        ${webcamActive ? '🛑 STOP WEBCAM AR' : (isIOS ? '📷 START WEBCAM AR (iOS)' : '📷 START WEBCAM AR')}
                    </button>
                `}
                <div style="display: flex; gap: 8px; width: 100%;">
                    <button class="btn-secondary" id="showMarkerBtn" style="flex: 1;">📷 Display Marker</button>
                    <button class="btn-secondary" id="showLogsBtn" style="flex: 1;">📋 System Logs</button>
                </div>
            </div>
        `;

        document.getElementById('showMarkerBtn')?.addEventListener('click', openMarkerModal);
        document.getElementById('showLogsBtn')?.addEventListener('click', openLogModal);
        updateLogBadgeUI();

        const startArBtn = document.getElementById('startArBtn');
        if (startArBtn) {
            startArBtn.addEventListener('click', async () => {
                requestDeviceOrientationPermission();
                if (arSupported && xrExperience) {
                    try {
                        console.log("Starting native WebXR immersive-ar session...");
                        await xrExperience.baseExperience.enterXRAsync('immersive-ar', 'local-floor');
                    } catch (err) {
                        console.warn("Primary enterXRAsync ('local-floor') failed, attempting fallback 'local' reference space:", err);
                        try {
                            await xrExperience.baseExperience.enterXRAsync('immersive-ar', 'local');
                        } catch (fallbackErr) {
                            console.error("Failed to enter WebXR Session:", fallbackErr);
                        }
                    }
                } else {
                    if (webcamActive) {
                        stopWebCamAR();
                    } else {
                        await startWebCamAR();
                    }
                }
            });
        }
    }

    function updateTimeSyncHUD() {
        const offsetVal = document.getElementById('offsetVal');
        const rttVal = document.getElementById('rttVal');
        if (offsetVal) offsetVal.textContent = `${timeOffset > 0 ? '+' : ''}${timeOffset} ms`;
        if (rttVal) rttVal.textContent = `${timeSyncLatency} ms`;
    }

    function updateTrackingStatusBadge(text, statusClass) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        if (statusText) statusText.textContent = text;
        if (statusDot) {
            statusDot.className = `status-dot ${statusClass}`;
        }
    }

    function openMarkerModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'markerModal';
        modal.innerHTML = `
            <div class="marker-modal-card">
                <button class="modal-close-btn" id="closeMarkerBtn">&times;</button>
                <h3 style="margin-bottom: 8px; color: #FFF;">AR Spatial Tracking Marker</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
                    Point another phone's WebXR camera at this marker to see synchronized Shared AR!
                </p>
                <img src="marker.png" alt="AR Tracking Marker" class="marker-img-preview">
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono);">
                    Real-world size target: 20cm &times; 20cm
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeMarkerBtn')?.addEventListener('click', () => {
            modal.remove();
        });
    }

    // Diagnostic Console Modal Renderers
    function openLogModal() {
        const existing = document.getElementById('logModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'logModal';
        modal.style.zIndex = '1000';
        
        modal.innerHTML = `
            <div class="log-modal-card">
                <button class="modal-close-btn" id="closeLogBtn">&times;</button>
                <h3 style="margin-bottom: 8px; color: #FFF; display: flex; align-items: center; gap: 8px;">
                    <span>📋 System Logs & Diagnostics</span>
                </h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px;">
                    Use these logs to diagnose WebXR, tracking, or connection issues on mobile/Quest.
                </p>
                <div class="log-console" id="logConsoleContainer">
                    ${renderLogLines()}
                </div>
                <div style="display: flex; gap: 10px; margin-top: 16px;">
                    <button class="btn-primary" style="padding: 10px 20px; font-size: 0.9rem;" id="copyLogsBtn">
                        📋 Copy Logs
                    </button>
                    <button class="btn-secondary" style="padding: 10px 20px; font-size: 0.9rem; width: auto;" id="clearLogsBtn">
                        Clear
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeLogBtn')?.addEventListener('click', () => modal.remove());
        document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
            logBuffer.length = 0;
            const container = document.getElementById('logConsoleContainer');
            if (container) container.innerHTML = renderLogLines();
            updateLogBadgeUI();
        });
        document.getElementById('copyLogsBtn')?.addEventListener('click', () => {
            const logText = logBuffer.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
            navigator.clipboard.writeText(logText);
            const btn = document.getElementById('copyLogsBtn');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = '📋 Copy Logs'; }, 2000);
        });

        const container = document.getElementById('logConsoleContainer');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function renderLogLines() {
        if (logBuffer.length === 0) {
            return `<div class="log-line" style="color: var(--text-secondary); font-style: italic;">No logs recorded yet.</div>`;
        }
        return logBuffer.map(log => {
            let color = 'var(--text-primary)';
            if (log.type === 'error') color = 'var(--accent-magenta)';
            if (log.type === 'warn') color = 'var(--accent-gold)';
            if (log.type === 'info') color = 'var(--accent-cyan)';
            return `<div class="log-line" style="color: ${color};">[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}</div>`;
        }).join('');
    }

    function updateLogConsoleDisplay() {
        const container = document.getElementById('logConsoleContainer');
        if (container) {
            container.innerHTML = renderLogLines();
            container.scrollTop = container.scrollHeight;
        }
    }

    function updateLogBadgeUI() {
        const logsBtn = document.getElementById('showLogsBtn');
        if (logsBtn) {
            const errorCount = logBuffer.filter(l => l.type === 'error').length;
            const warnCount = logBuffer.filter(l => l.type === 'warn').length;
            if (errorCount > 0) {
                logsBtn.innerHTML = `📋 System Logs <span class="badge error-badge">${errorCount}</span>`;
                logsBtn.classList.add('has-error');
            } else if (warnCount > 0) {
                logsBtn.innerHTML = `📋 System Logs <span class="badge warn-badge">${warnCount}</span>`;
                logsBtn.classList.remove('has-error');
            } else {
                logsBtn.innerHTML = `📋 System Logs`;
                logsBtn.classList.remove('has-error');
            }
        }
    }

    /**
     * ============================================================================
     * SECTION 7: Main Application Bootstrapper
     * ============================================================================
     */
    async function initApp() {
        // 1. Check iOS Platform notice
        const showNotice = await checkShouldShowIOSNotice();
        if (showNotice) {
            renderIOSNoticeUI(async (launchWebcamDirectly) => {
                await startMainApp();
                if (launchWebcamDirectly) {
                    await startWebCamAR();
                }
            });
            return;
        }

        await startMainApp();
    }

    async function startMainApp() {
        // 2. Perform Network Time Synchronization
        await synchronizeClock();

        // 3. Initialize Babylon Engine & 3D Scene
        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        scene = createScene();

        // Start Babylon Render Loop
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Handle Canvas Window Resize
        window.addEventListener('resize', () => {
            engine.resize();
        });

        // 4. Setup WebXR Experience & Dual Engine Fallback
        await setupWebXR();
    }

    // Launch application once DOM content is ready
    window.addEventListener('DOMContentLoaded', initApp);

})();
