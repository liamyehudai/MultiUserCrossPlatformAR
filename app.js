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
        captureLog('error', [event.error || event.message]);
    });
    window.addEventListener('unhandledrejection', (event) => {
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
     * SECTION 1: Platform Gating & WebXR Capability Detection
     * ============================================================================
     * Apple restricts the standard WebXR Device API on Mobile Safari.
     * We check for iOS/iPadOS user agents, but auto-detect WebXR-capable browsers
     * (e.g., Mozilla WebXR Viewer, XR Browser) and provide a manual bypass.
     */
    function isIOSDevice() {
        const userAgent = window.navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        const isIPadOS = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return isIOS || isIPadOS;
    }

    function isWebXRSupportedOrBypassed() {
        // 1. Check for explicit URL query parameter bypass (?xr=1, ?bypass=1, ?bypass_ios=1)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('xr') || urlParams.has('bypass') || urlParams.has('bypass_ios')) {
            return true;
        }

        // 2. Check for session storage bypass flag
        if (sessionStorage.getItem('bypass_ios_xr_check') === 'true') {
            return true;
        }

        // 3. Check for known WebXR browser user-agent identifiers
        const userAgent = window.navigator.userAgent || '';
        if (/WebXRViewer|WebXR|XRBrowser|MozillaWebXR/i.test(userAgent)) {
            return true;
        }

        // 4. Check for WebXR API availability on window or navigator
        if ('xr' in navigator && navigator.xr) {
            return true;
        }
        if (window.WebXR || window.WebXRPolyfill) {
            return true;
        }

        return false;
    }

    async function checkShouldShowIOSRestriction() {
        if (!isIOSDevice()) {
            return false; // Non-iOS device, proceed directly
        }

        if (isWebXRSupportedOrBypassed()) {
            return false; // iOS device running a recognized WebXR browser or bypassed
        }

        // Probing for immersive-ar session support if navigator.xr exists
        if ('xr' in navigator && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                if (supported) return false;
            } catch (e) {
                console.warn("Error probing WebXR session support:", e);
            }
        }

        return true; // iOS device running standard Safari without WebXR
    }

    function renderIOSRestrictionUI(onBypassCallback) {
        const currentUrl = window.location.href;
        uiContainer.innerHTML = `
            <div class="modal-overlay" id="iosModal">
                <div class="ios-card">
                    <div class="ios-icon">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                    </div>
                    <h2>iOS WebXR Restriction</h2>
                    <p>
                        Apple Mobile Safari restricts the standard WebXR API required for spatial camera image tracking.
                    </p>
                    <div class="ios-instructions">
                        <strong>To run Shared AR on iOS:</strong>
                        <ol>
                            <li>Download <strong>Mozilla WebXR Viewer</strong> or <strong>XR Browser</strong> from the App Store.</li>
                            <li>Copy the URL below and paste it into your WebXR browser address bar.</li>
                        </ol>
                        <div class="copy-box">
                            <input type="text" readonly value="${currentUrl}" class="copy-input" id="urlInput">
                            <button class="btn-secondary" style="width: auto; padding: 6px 14px;" id="copyBtn">Copy Link</button>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
                        <button class="btn-primary" id="bypassIOSBtn">
                            🚀 I'm using a WebXR Browser — Launch AR
                        </button>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                            Already in XR Browser or WebXR Viewer? Tap above to launch directly.
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('copyBtn')?.addEventListener('click', () => {
            const input = document.getElementById('urlInput');
            if (input) {
                input.select();
                navigator.clipboard.writeText(input.value);
                const btn = document.getElementById('copyBtn');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
            }
        });

        document.getElementById('bypassIOSBtn')?.addEventListener('click', () => {
            sessionStorage.setItem('bypass_ios_xr_check', 'true');
            uiContainer.innerHTML = '';
            if (typeof onBypassCallback === 'function') {
                onBypassCallback();
            }
        });
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
        const endpoints = [
            'https://worldtimeapi.org/api/timezone/Etc/UTC',
            'https://timeapi.io/api/v1/time/current/zone?timeZone=UTC'
        ];

        let minRTT = Infinity;
        let selectedOffset = 0;

        // Perform 3 iterations to select the sample with minimum network jitter
        for (let attempt = 0; attempt < 3; attempt++) {
            for (const url of endpoints) {
                try {
                    const tStart = Date.now();
                    const response = await fetch(url, { cache: 'no-store' });
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
                        const estimatedServerTimeAtEnd = serverTimeMs + latency;
                        selectedOffset = estimatedServerTimeAtEnd - tEnd;
                    }
                } catch (err) {
                    console.warn(`Time API endpoint failure (${url}):`, err);
                }
            }
        }

        if (minRTT !== Infinity) {
            timeOffset = selectedOffset;
            timeSyncLatency = Math.round(minRTT);
            isTimeSynced = true;
            console.log(`Clock synchronized via API. Offset: ${timeOffset}ms, RTT: ${timeSyncLatency}ms`);
        } else {
            // Fallback: Estimate server time using HTTP HEAD response header Date
            try {
                const tStart = Date.now();
                const headRes = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                const serverDateStr = headRes.headers.get('date');
                const tEnd = Date.now();

                if (serverDateStr) {
                    const rtt = tEnd - tStart;
                    const serverTimeMs = new Date(serverDateStr).getTime() + (rtt / 2.0);
                    timeOffset = serverTimeMs - tEnd;
                    timeSyncLatency = Math.round(rtt);
                    isTimeSynced = true;
                    console.log(`Clock synchronized via HTTP Date Header. Offset: ${timeOffset}ms`);
                }
            } catch (fallbackErr) {
                console.error("Time synchronization failed entirely. Defaulting to local clock:", fallbackErr);
                timeOffset = 0;
                timeSyncLatency = 0;
                isTimeSynced = false;
            }
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
        });

        return scene;
    }

    /**
     * ============================================================================
     * SECTION 5: WebXR Image Tracking Session Initialization
     * ============================================================================
     */
    async function setupWebXR() {
        const isSupported = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
        if (!isSupported) {
            console.log("WebXR immersive-ar mode is not supported on this device. Running in Desktop Preview mode.");
            renderMainHUD(false);
            return;
        }

        try {
            xrExperience = await scene.createDefaultXRExperienceAsync({
                disableDefaultUI: true,
                uiOptions: {
                    sessionMode: 'immersive-ar',
                    referenceSpaceType: 'local-floor'
                },
                optionalFeatures: ['image-tracking']
            });

            const fm = xrExperience.baseExperience.featuresManager;
            let imageTracking = null;

            // Enable WebXR Image Tracking Module with graceful fallback for browsers without image tracking support (e.g. Meta Quest)
            try {
                imageTracking = fm.enableFeature(
                    BABYLON.WebXRFeatureName.IMAGE_TRACKING,
                    'latest',
                    {
                        images: [
                            {
                                src: 'marker.png',
                                // 20cm expected marker width
                                estimatedRealWorldWidth: 0.2
                            }
                        ]
                    },
                    false // <--- REQUIRED = FALSE (Marks this feature as optional in the WebXR session request)
                );
                console.log("WebXR Image Tracking module successfully enabled.");
            } catch (imageTrackingErr) {
                console.warn(
                    "WebXR Image Tracking is not supported on this browser/device (like Meta Quest). " +
                    "Falling back to basic AR session placement.",
                    imageTrackingErr
                );
            }

            // Handle WebXR session state changes
            xrExperience.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    // Check if image tracking feature is actually supported and attached to the session
                    const isImageTrackingAttached = imageTracking && imageTracking.attached;
                    if (isImageTrackingAttached) {
                        markerRoot.setEnabled(false); // Hide 3D scene until camera locates image marker
                        updateTrackingStatusBadge("Searching for Marker...", "searching");
                    } else {
                        // Quest fallback positioning
                        markerRoot.setEnabled(true);
                        const cameraPosition = xrExperience.baseExperience.camera.position;
                        const direction = xrExperience.baseExperience.camera.getForwardRay().direction;
                        markerRoot.position.copyFrom(cameraPosition).addInPlace(direction.scale(1.2));
                        markerRoot.rotation.y = Math.atan2(direction.x, direction.z);
                        updateTrackingStatusBadge("AR Active (No Tracking Marker)", "synced");
                    }
                    const startArBtn = document.getElementById('startArBtn');
                    if (startArBtn) startArBtn.style.display = 'none';
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    markerRoot.setEnabled(true); // Re-enable for fallback viewer
                    isTrackingActive = false;
                    updateTrackingStatusBadge("AR Session Ended", "");
                    const startArBtn = document.getElementById('startArBtn');
                    if (startArBtn) startArBtn.style.display = 'flex';
                }
            });

            if (imageTracking) {
                // Handle Tracked Image Position/Orientation Matrix Updates
                imageTracking.onTrackedImageUpdatedObservable.add((trackedImage) => {
                    // Only process matrix if image tracking is attached and active
                    if (!imageTracking.attached) return;

                    // Decompose transformation matrix to update 3D anchor position and rotation
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

            renderMainHUD(true);

        } catch (err) {
            console.error("Failed to initialize WebXR Experience:", err);
            renderMainHUD(false);
        }
    }

    /**
     * ============================================================================
     * SECTION 6: UI Rendering & User Interaction Handlers
     * ============================================================================
     */
    function renderMainHUD(arSupported) {
        uiContainer.innerHTML = `
            <div class="hud-header">
                <div class="hud-badge-row">
                    <div class="status-badge" id="trackingStatus">
                        <span class="status-dot ${arSupported ? 'searching' : 'synced'}" id="statusDot"></span>
                        <span id="statusText">${arSupported ? 'AR Ready' : '3D Preview Mode'}</span>
                    </div>
                </div>

                <div class="time-sync-card">
                    <div>Clock Sync Offset: <span class="val" id="offsetVal">${timeOffset} ms</span></div>
                    <div>Network RTT: <span class="val" id="rttVal">${timeSyncLatency} ms</span></div>
                </div>
            </div>

            <div class="hud-footer">
                ${arSupported ? `
                    <button class="btn-primary" id="startArBtn" style="margin-bottom: 8px;">
                        <svg style="width: 20px; height: 20px; fill: currentColor; margin-right: 6px;" viewBox="0 0 24 24">
                            <path d="M21 4.5H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-11c0-1.1-.9-2-2-2zM7.5 14c-1.38 0-2.5-1.12-2.5-2.5S6.12 9 7.5 9s2.5 1.12 2.5 2.5S8.88 14 7.5 14zm9 0c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        START AR
                    </button>
                ` : ''}
                <div style="display: flex; gap: 8px; width: 100%;">
                    <button class="btn-secondary" id="showMarkerBtn" style="flex: 1;">📷 Display Marker</button>
                    <button class="btn-secondary" id="showLogsBtn" style="flex: 1;">📋 System Logs</button>
                </div>
            </div>
        `;

        document.getElementById('showMarkerBtn')?.addEventListener('click', openMarkerModal);
        document.getElementById('showLogsBtn')?.addEventListener('click', openLogModal);
        updateLogBadgeUI();

        if (arSupported) {
            const startArBtn = document.getElementById('startArBtn');
            startArBtn?.addEventListener('click', async () => {
                if (xrExperience) {
                    try {
                        console.log("Starting WebXR immersive-ar session...");
                        await xrExperience.baseExperience.enterXRAsync('immersive-ar', 'local-floor');
                    } catch (err) {
                        console.error("Failed to enter WebXR Session:", err);
                    }
                } else {
                    console.error("WebXR Experience not initialized yet!");
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
        // 1. Check iOS Platform Restriction vs WebXR capabilities / bypass
        const showRestriction = await checkShouldShowIOSRestriction();
        if (showRestriction) {
            renderIOSRestrictionUI(() => {
                startMainApp();
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

        // 4. Setup WebXR Experience & Image Tracking
        await setupWebXR();
    }

    // Launch application once DOM content is ready
    window.addEventListener('DOMContentLoaded', initApp);

})();
