// src/ScrollSection.jsx
import * as THREE from 'three'
import React, { useRef, useMemo, Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  ScrollControls,
  useScroll,
  Scroll,
} from '@react-three/drei'
import PLYModel from './PLYModel.jsx'
import JellyFishRipple from './JellyFishRipple.jsx'
import { useControls, monitor, Leva } from 'leva'
import { getProject, val } from '@theatre/core'
import theatreeBBState from './theatreState.json'
import {
  editable as e,
  SheetProvider,
  PerspectiveCamera,
} from '@theatre/r3f'
import Enveremnt from './Enveremnt.jsx'


// import studio from '@theatre/studio'
// import extension from '@theatre/r3f/dist/extension'

// studio.initialize()
// studio.extend(extension)

// -----------------------/component/------------
import WaterScene from './component/WaterScene.jsx'
import UnderwaterFog from './component/underwater/UnderwaterFog.jsx'
import RockStone from './rock/RockStone.jsx'
import SpringPath from './SpringPath.jsx'
import ScrollOffsetBridge from './ScrollOffsetBridge.jsx'

// -----------------------------------------------
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

/* ---------------- Config big screen pages scroll a ---------------- */
const PAGES = 8
const SPHERE_RADIUS = 0.07

// default timings (can be overridden via GUI)
const DEFAULT_FADE_ENTER_MS = 40
const DEFAULT_FADE_EXIT_MS = 500
const DEFAULT_FADE_HOLD_MS = 20
const DEFAULT_FORCED_BLEND_MS = 500
const DEFAULT_FADE_COOLDOWN_MS = 300

/* ---------------- HelixCurve (needed by Scene) ---------------- */
class HelixCurve extends THREE.Curve {
  constructor ({ turns = 1, radius = 1, height = 1 } = {}) {
    super()
    this.turns = turns
    this.radius = radius
    this.height = height
  }
  getPoint (t, optionalTarget = new THREE.Vector3()) {
    const angle = t * this.turns * Math.PI * 2
    const x = Math.cos(angle) * this.radius
    const z = Math.sin(angle) * this.radius
    const y = (t - 0.5) * this.height
    return optionalTarget.set(x, y, z)
  }
}

/* ---------------- Responsive helpers ---------------- */
function computeScaleForWidth (width) {
  if (!width) return 1
  if (width <= 380) return 0.6
  if (width <= 480) return 0.7
  if (width <= 768) return 0.85
  return 1
}
function useResponsiveSetup ({ wrapperRef, cameraRef }) {
  const { size } = useThree()
  useEffect(() => {
    if (!wrapperRef || !wrapperRef.current) return
    const s = computeScaleForWidth(size.width)
    wrapperRef.current.scale.set(s, s, s)
    if (cameraRef && cameraRef.current) {
      const cam = cameraRef.current
      const baseFov = 40
      let targetFov = baseFov
      if (size.width <= 380) targetFov = 60
      else if (size.width <= 480) targetFov = 70
      else if (size.width <= 768) targetFov = 38
      else targetFov = baseFov
      cam.fov = targetFov
      cam.updateProjectionMatrix()
      try {
        const origPos = cam.position.clone()
        const radial = new THREE.Vector3(origPos.x, 0, origPos.z)
        const len = radial.length()
        if (len > 0.001) {
          const comp = 1 / Math.max(0.4, s)
          const newLen = THREE.MathUtils.lerp(len, len * comp, 0.25)
          radial.setLength(newLen)
          cam.position.x = radial.x
          cam.position.z = radial.z
        }
      } catch (e) {}
    }
  }, [size.width, wrapperRef, cameraRef])
}

/* ---------------- Leva monitor (small) ---------------- */
function CameraDebugGUI ({ cameraRef, isOverriding }) {
  useControls(
    'Camera Debug',
    {
      OverrideActive: monitor(() => (isOverriding ? 'YES' : 'no'), {
        interval: 250
      }),
      PositionXYZ: monitor(
        () => {
          const c = cameraRef.current
          if (!c) return '—'
          const p = c.position
          return `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`
        },
        { interval: 250 }
      ),
      RotationEulerDeg_YXZ: monitor(
        () => {
          const c = cameraRef.current
          if (!c) return '—'
          const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ')
          return `${THREE.MathUtils.radToDeg(e.x).toFixed(
            1
          )}, ${THREE.MathUtils.radToDeg(e.y).toFixed(
            1
          )}, ${THREE.MathUtils.radToDeg(e.z).toFixed(1)}`
        },
        { interval: 250 }
      ),
      Quaternion: monitor(
        () => {
          const c = cameraRef.current
          if (!c) return '—'
          const q = c.quaternion
          return `${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(
            4
          )}, ${q.w.toFixed(4)}`
        },
        { interval: 250 }
      )
    },
    { collapsed: false }
  )
  return null
}

/* ---------------- Small DOM overlay to copy values ---------------- */
function CameraCopyOverlay ({ cameraRef }) {
  const [pos, setPos] = useState('—')
  const [eulerYXZ, setEulerYXZ] = useState('—')
  const [quat, setQuat] = useState('—')

  useEffect(() => {
    let mounted = true
    const id = setInterval(() => {
      if (!mounted) return
      const c = cameraRef.current
      if (!c) {
        setPos('—')
        setEulerYXZ('—')
        setQuat('—')
        return
      }
      const p = c.position
      setPos(`${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`)
      const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ')
      setEulerYXZ(
        `${THREE.MathUtils.radToDeg(e.x).toFixed(
          3
        )}, ${THREE.MathUtils.radToDeg(e.y).toFixed(
          3
        )}, ${THREE.MathUtils.radToDeg(e.z).toFixed(3)}`
      )
      const q = c.quaternion
      setQuat(
        `${q.x.toFixed(6)}, ${q.y.toFixed(6)}, ${q.z.toFixed(6)}, ${q.w.toFixed(
          6
        )}`
      )
    }, 120)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [cameraRef])

  const copyToClipboard = text => {
    try {
      navigator.clipboard.writeText(text)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 9999,
        background: 'rgba(10,10,12,0.75)',
        color: '#eee',
        padding: '10px 12px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        maxWidth: 400,
        display: 'none'
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 600 }}>
        Camera (copy for Theatre)
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ color: '#9aaaaa' }}>Position (XYZ)</div>
        <div>{pos}</div>
        <button style={{ marginTop: 6 }} onClick={() => copyToClipboard(pos)}>
          Copy Position
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ color: '#9aa' }}>Rotation (Euler YXZ in degrees)</div>
        <div>{eulerYXZ}</div>
        <button
          style={{ marginTop: 6 }}
          onClick={() => copyToClipboard(eulerYXZ)}
        >
          Copy Euler (YXZ)
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ color: '#9aa' }}>Quaternion (x, y, z, w)</div>
        <div style={{ wordBreak: 'break-all' }}>{quat}</div>
        <button style={{ marginTop: 6 }} onClick={() => copyToClipboard(quat)}>
          Copy Quaternion
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
        Tip: paste quaternion into Theatre if possible — it preserves rotation
        exactly.
      </div>
    </div>
  )
}

/* ---------------- Controlled fade overlay (reads controller) ---------------- */
function ControlledFadeOverlay ({
  color = '#050417',
  exitDuration = DEFAULT_FADE_EXIT_MS,
  holdMs = DEFAULT_FADE_HOLD_MS
}) {
  const [mode, setMode] = useState('hidden') // 'hidden' | 'entered' | 'exiting'
  useEffect(() => {
    let mounted = true
    let holdTimer = null

    function checkController () {
      const ctrl = window._springFadeController
      if (!ctrl) return
      if (!ctrl.sessionId) return

      if (ctrl.enter && !ctrl.entered) {
        ctrl.entered = true
        ctrl.exited = false
        window._springFadeController = ctrl
        setMode('entered')
        if (holdMs > 0) {
          clearTimeout(holdTimer)
          holdTimer = setTimeout(() => {
            // remain in 'entered' until ctrl.exit flips
          }, holdMs)
        }
      }
      if (ctrl.exit && !ctrl.exited) {
        ctrl.exited = true
        window._springFadeController = ctrl
        setMode('exiting')
        setTimeout(() => {
          if (mounted) setMode('hidden')
        }, Math.max(40, exitDuration + 80))
      }
    }
    const id = setInterval(checkController, 80)
    checkController()
    return () => {
      mounted = false
      clearInterval(id)
      clearTimeout(holdTimer)
    }
  }, [exitDuration, holdMs])

  if (mode === 'hidden') return null
  const base = {
    pointerEvents: 'none',
    position: 'fixed',
    left: 0,
    top: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 99999,
    background: color
  }
  if (mode === 'entered') {
    return <div style={{ ...base, opacity: 1 }} />
  }
  return (
    <div
      style={{
        ...base,
        opacity: 1,
        transition: `opacity ${exitDuration}ms cubic-bezier(.2,.0,.0,1)`
      }}
      ref={el => {
        if (!el) return
        requestAnimationFrame(() => {
          if (el) el.style.opacity = 0
        })
      }}
    />
  )
}

/* ---------------- Main component ---------------- */
export default function ScrollSection () {
  const project = getProject('myProject', { state: theatreeBBState })

  window.__THEATRE_PROJECT__ = project

  const sheet = project.sheet('Scene')
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const pages = isMobile ? 9 : PAGES

  // --- LEVA: keep all existing GUI controls intact; add Fade group (color + timings + cooldown)
  const { fadeColor, forcedBlendMs, fadeExitMs, fadeHoldMs, fadeCooldownMs } =
    useControls('Fade', {
      fadeColor: { value: '#f2cdc4' },
      forcedBlendMs: {
        value: DEFAULT_FORCED_BLEND_MS,
        min: 50,
        max: 3000,
        step: 10
      },
      fadeExitMs: { value: DEFAULT_FADE_EXIT_MS, min: 50, max: 3000, step: 10 },
      fadeHoldMs: { value: DEFAULT_FADE_HOLD_MS, min: 0, max: 2000, step: 10 },
      fadeCooldownMs: {
        value: DEFAULT_FADE_COOLDOWN_MS,
        min: 0,
        max: 2000,
        step: 10
      }
    })

  // NEW: Fade toggles for up/down enter/exit
  const { upEnterEnabled, upExitEnabled, downEnterEnabled, downExitEnabled } =
    useControls('Fade Toggles', {
      upEnterEnabled: { label: 'Up-scroll: ENTER enabled', value: true },
      upExitEnabled: { label: 'Up-scroll: EXIT enabled', value: true },
      downEnterEnabled: { label: 'Down-scroll: ENTER enabled', value: true },
      downExitEnabled: { label: 'Down-scroll: EXIT enabled', value: true }
    })

  // Override window controls (user requested) — only START remains (end is determined by SpringPath end)
  const { overrideStartSec, forceImmediateExitOnEnd } = useControls('Override Window', {
    overrideStartSec: {
      value: 45,
      min: 0,
      max: 3600,
      step: 1,
      label: 'Override START (s)'
    },
    forceImmediateExitOnEnd: {
      value: true,
      label: 'Force immediate EXIT when SpringPath ends'
    }
  })

  // make these available to the Scene/bridge via global defaults
  useEffect(() => {
    window._springFadeDefaults = {
      forcedBlendMs: forcedBlendMs,
      fadeExitMs: fadeExitMs,
      fadeHoldMs: fadeHoldMs,
      fadeCooldownMs: fadeCooldownMs,
      fadeColor: fadeColor,
      upEnterEnabled,
      upExitEnabled,
      downEnterEnabled,
      downExitEnabled,
      overrideStartSec
    }
  }, [
    forcedBlendMs,
    fadeExitMs,
    fadeHoldMs,
    fadeCooldownMs,
    fadeColor,
    upEnterEnabled,
    upExitEnabled,
    downEnterEnabled,
    downExitEnabled,
    overrideStartSec
  ])

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <Leva hidden={isMobile} />

      <Canvas
        gl={{
          alpha: true,
          premultipliedAlpha: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.NoToneMapping
        }}
        shadows
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
        style={{ width: '100vw', height: '100vh' }}
      >
        <Suspense fallback={null}>
          <WaterScene />
          <UnderwaterFog
            waterY={0}
            surfaceColor='#E8C5D2'
            surfaceDensity={0.00042}
            underColor='#7E66A4'
            underDensity={0.0014}
            blendMeters={9}
          />
        </Suspense>

        <ScrollControls pages={pages} distance={3} damping={0.15}>
          <SheetProvider sheet={sheet}>
            <Scene
              sheet={sheet}
              guiFadeDefaults={{
                forcedBlendMs,
                fadeExitMs,
                fadeHoldMs,
                fadeCooldownMs,
                fadeColor,
                upEnterEnabled,
                upExitEnabled,
                downEnterEnabled,
                downExitEnabled,
                overrideStartSec,
                forceImmediateExitOnEnd
              }}
            />

            <ScrollOffsetBridge />
          </SheetProvider>
          <Scroll html style={{ position: 'absolute', width: '100vw' }} />
        </ScrollControls>
      </Canvas>

      {/* overlays */}
      <CameraOverlayBridge />
      <FadeOverlayBridge />
    </div>
  )
}

/* ---------------- Bridge components ---------------- */
function CameraOverlayBridge () {
  const [cameraRef, setCameraRef] = useState(null)
  useEffect(() => {
    const id = setInterval(() => {
      if (window._springCamRef && window._springCamRef.current)
        setCameraRef(window._springCamRef)
    }, 200)
    return () => clearInterval(id)
  }, [])
  if (!cameraRef) return null
  return <CameraCopyOverlay cameraRef={cameraRef} />
}

function FadeOverlayBridge () {
  const defaults =
    (typeof window !== 'undefined' && window._springFadeDefaults) || {}
  const color = defaults.fadeColor || '#f2cdc4'
  const exitDuration = defaults.fadeExitMs || DEFAULT_FADE_EXIT_MS
  const holdMs = defaults.fadeHoldMs || DEFAULT_FADE_HOLD_MS
  return (
    <ControlledFadeOverlay
      color={color}
      exitDuration={exitDuration}
      holdMs={holdMs}
    />
  )
}

/* ---------------- Scene (inside Canvas) ---------------- */
function Scene ({ sheet, guiFadeDefaults = {} }) {
  const scroll = useScroll()
  const { set } = useThree()

  const cameraRef = useRef()
  const theatreCamRef = useRef()
  const springGroupRef = useRef()
  const sphereRef = useRef()
  const wrapperRef = useRef()

  // expose cameraRef externally for overlay copy
  useEffect(() => {
    window._springCamRef = cameraRef
  }, [cameraRef])
  useEffect(() => {
    window._springSheetRef = sheet
  }, [sheet])

  useResponsiveSetup({ wrapperRef, cameraRef })

  const {
    turns,
    coilRadius,
    pathHeight,
    pathScale,
    radialOffset,

    mode,
    startAt,
    brickCount,
    cameraSideOffset,
    cameraUpOffset,
    yOffsetDeg,
    xOffsetDeg,
    zOffsetDeg,
    positionSmoothing,
    rotationSmoothing,
    showDebugMarker,

    hiddenDepth,
    activationRange,
    riseSpeed,

    activeRadius,
    activeFade,
    downAmplitude,
    frontHold,

    curvatureEnabled,
    curvatureStrength,
    curvatureRange,
    curvatureFalloff,

    floatEnabled,
    floatSpeed,
    rotationIntensity,
    floatIntensity,
    floatingRange,

    scrollResponsiveness,
    startupBias,
    maxStep,

    riseSmoothing,

    maxPitchDeg,

    minCameraDistance,
    minCamY,
    maxCamY,
    maxMovePerFrameFactor
  } = useControls({
    turns: { value: 0.95, min: 0.1, max: 4, step: 0.01 },
    coilRadius: { value: 7.0, min: 0.1, max: 20, step: 0.1 },
    pathHeight: { value: 10, min: 0.1, max: 100, step: 0.1 },
    pathScale: { value: 5, min: 0.1, max: 50, step: 0.1 },
    radialOffset: { value: 0, min: -10, max: 10, step: 0.01 },

    mode: {
      value: 'oppositeSideMove',
      options: ['normal', 'oppositeSide', 'oppositeSideMove']
    },
    startAt: { value: 'top', options: ['top', 'bottom'] },
    brickCount: { value: 20, min: 1, max: 400, step: 1 },
    cameraSideOffset: { value: -10, min: -40, max: 40, step: 0.01 },
    cameraUpOffset: { value: 5.0, min: -20, max: 50, step: 0.01 },
    yOffsetDeg: { value: -64, min: -180, max: 180, step: 0.1 },
    xOffsetDeg: { value: -8, min: -180, max: 180, step: 0.1 },
    zOffsetDeg: { value: 0, min: -180, max: 180, step: 0.1 },
    positionSmoothing: { value: 0.38, min: 0, max: 1, step: 0.01 },
    rotationSmoothing: { value: 0.2, min: 0, max: 1, step: 0.005 },
    showDebugMarker: { value: true },

    hiddenDepth: { value: 70, min: 0, max: 400, step: 1 },
    activationRange: { value: 60, min: 1, max: 400, step: 0.5 },
    riseSpeed: { value: 10, min: 0.1, max: 30, step: 0.1 },

    activeRadius: { value: 3, min: 0, max: 80, step: 1 },
    activeFade: { value: 5, min: 0, max: 80, step: 0.5 },
    downAmplitude: { value: 30.0, min: 0, max: 80, step: 0.1 },
    frontHold: { value: 1, min: 0, max: 40, step: 1 },

    curvatureEnabled: { value: true },
    curvatureStrength: { value: 2.0, min: -40, max: 40, step: 0.1 },
    curvatureRange: { value: 0, min: 0, max: 120, step: 1 },
    curvatureFalloff: { value: 0, min: 0.1, max: 80, step: 0.5 },

    floatEnabled: { value: true },
    floatSpeed: { value: 1.0, min: 0.0, max: 8, step: 0.01 },
    rotationIntensity: { value: 0.6, min: 0, max: 6, step: 0.01 },
    floatIntensity: { value: 1.0, min: 0, max: 8, step: 0.01 },
    floatingRange: { value: [-0.2, 0.2] },

    scrollResponsiveness: { value: 0.45, min: 0.01, max: 1.5, step: 0.01 },
    startupBias: { value: 0.9, min: 0, max: 1.0, step: 0.01 },
    maxStep: { value: 0.12, min: 0.001, max: 1.0, step: 0.001 },
    scrollSpeedMultiplier: {
      value: 1.0,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: 'Scroll Speed Multiplier'
    },

    riseSmoothing: { value: 0.6, min: 0.01, max: 1.0, step: 0.01 },

    maxPitchDeg: { value: 60, min: 0, max: 90, step: 1 },

    minCameraDistance: { value: 19, min: 1, max: 400, step: 1 },

    minCamY: { value: -5, min: -200, max: 200, step: 1 },
    maxCamY: { value: 80, min: -200, max: 200, step: 1 },
    maxMovePerFrameFactor: { value: 0.15, min: 0.01, max: 10, step: 0.01 }
  })

  const brickSpec = useMemo(() => ({ width: 3, height: 2, depth: 8 }), [])
  const curve = useMemo(
    () => new HelixCurve({ turns, radius: coilRadius, height: pathHeight }),
    [turns, coilRadius, pathHeight]
  )

  function ensureMatrixWorld () {
    if (!springGroupRef.current) return new THREE.Matrix4()
    springGroupRef.current.updateMatrixWorld(true)
    return springGroupRef.current.matrixWorld.clone()
  }

  const activeIndexRef = useRef(0)
  const bricksActiveRef = useRef(0)
  const smoothedIndexRef = useRef(0)
  const lastRawRef = useRef(0)

  // override state tracking
  const [isOverriding, setIsOverriding] = useState(false)
  const prevOverrideRef = useRef(false)
  const blendCancelRef = useRef(null)

  // forced blend state (local refs)
  const forcedBlendRef = useRef({
    active: false,
    startTime: 0,
    duration:
      (guiFadeDefaults && guiFadeDefaults.forcedBlendMs) ||
      (typeof window !== 'undefined' &&
        window._springFadeDefaults?.forcedBlendMs) ||
      DEFAULT_FORCED_BLEND_MS,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromQuat: new THREE.Quaternion(),
    toQuat: new THREE.Quaternion(),
    sessionId: null,
    sessionDir: 'down'
  })

  // soft pause ref: used to implement the 1s soft-start behavior
  const softPauseRef = useRef({ active: false, start: 0, duration: 1000 })

  // stability detection
  const stableFramesRef = useRef(0)
  const STABLE_REQUIRED = 3
  const POS_THRESHOLD = 0.12
  const ANGLE_THRESHOLD_DEG = 1.5

  // fade trigger cooldown: avoid repeated quick toggles
  const lastFadeTriggerRef = useRef(0)

  // helper to create unique session id
  function makeSessionId () {
    return `fade-${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1e6
    ).toString(36)}`
  }

  // NEW: track last direction we triggered START for (so repeated small re-enters don't retrigger)
  const lastTriggeredDirRef = useRef(null) // null | 'down' | 'up'
  const prevSeqPosRef = useRef(0)

  // map scroll -> theatre timeline (keeps theatre in sync)
  useFrame(() => {
    if (!sheet || !scroll) return
    const sequenceLength = Math.max(
      1,
      Number(val(sheet.sequence.pointer.length) || 1)
    )
    sheet.sequence.position = scroll.offset * sequenceLength
  })

  // detect crossing of overrideStartSec only (trigger on crossing into >= overrideStartSec)
  useFrame(() => {
    if (!sheet) return

    // --- determine sequence time in seconds robustly ---
    let seqPosSeconds = 0
    try {
      const ptr = sheet.sequence && sheet.sequence.pointer
      if (ptr && typeof ptr.time === 'number') {
        seqPosSeconds = ptr.time
      } else {
        const rawPos = Number(sheet.sequence.position || 0)
        let fps = 60
        if (ptr) {
          if (typeof ptr.fps === 'number' && ptr.fps > 0) fps = ptr.fps
          else if (typeof ptr.frameRate === 'number' && ptr.frameRate > 0)
            fps = ptr.frameRate
        }
        const ptrLen = ptr && typeof ptr.length === 'number' ? ptr.length : NaN
        if (isFinite(ptrLen) && ptrLen > 1000) {
          seqPosSeconds = rawPos / Math.max(1, fps)
        } else {
          if (rawPos > fps * 5) seqPosSeconds = rawPos / Math.max(1, fps)
          else seqPosSeconds = rawPos
        }
      }
    } catch (e) {
      seqPosSeconds = Number(sheet.sequence.position || 0)
    }

    // read GUI override START parameter
    const AUTOSTART_SEC =
      typeof guiFadeDefaults.overrideStartSec === 'number'
        ? guiFadeDefaults.overrideStartSec
        : window._springFadeDefaults?.overrideStartSec || 10

    // compute scroll direction using lastRawRef (previous frame) and current scroll.offset if available
    let currScrollOffset = null
    try {
      currScrollOffset = scroll
        ? THREE.MathUtils.clamp(scroll.offset, 0, 1)
        : null
    } catch (e) {
      currScrollOffset = null
    }
    const directionDown =
      currScrollOffset == null
        ? true
        : currScrollOffset > (lastRawRef.current || 0)

    // ------------------ CLEANED: START crossing handling (only for forward/down) ------------------
    const prevSeq = prevSeqPosRef.current || 0
    const crossedStart = prevSeq < AUTOSTART_SEC && seqPosSeconds >= AUTOSTART_SEC

    // Clean up lingering controller if user has scrolled back below START
    try {
      const ctrlCleanup = window._springFadeController || null
      if (ctrlCleanup && ctrlCleanup.sessionId && seqPosSeconds < AUTOSTART_SEC) {
        window._springFadeController = null
        window._springFadeDefaults = {
          ...(window._springFadeDefaults || {}),
          overrideStartSec: AUTOSTART_SEC
        }
        if (forcedBlendRef && forcedBlendRef.current && forcedBlendRef.current.sessionId === ctrlCleanup.sessionId) {
          forcedBlendRef.current.active = false
        }
        lastTriggeredDirRef.current = null
      }
    } catch (e) { /* ignore */ }

    // Only trigger a START-enter when crossing happens AND the scroll direction is FORWARD/DOWN.
    // Do NOT trigger any fade on reverse/up scroll (user requested).
    if (crossedStart && directionDown) {
      const defaults =
        (typeof window !== 'undefined' && window._springFadeDefaults) ||
        guiFadeDefaults ||
        {}
      const color = defaults.fadeColor || guiFadeDefaults.fadeColor || '#f2cdc4'
      const forcedBlendMsVal =
        defaults.forcedBlendMs ||
        guiFadeDefaults.forcedBlendMs ||
        DEFAULT_FORCED_BLEND_MS
      const fadeExitMsVal =
        defaults.fadeExitMs ||
        guiFadeDefaults.fadeExitMs ||
        DEFAULT_FADE_EXIT_MS
      const fadeHoldMsVal =
        defaults.fadeHoldMs ||
        guiFadeDefaults.fadeHoldMs ||
        DEFAULT_FADE_HOLD_MS
      const fadeCooldownMsVal =
        defaults.fadeCooldownMs ||
        guiFadeDefaults.fadeCooldownMs ||
        DEFAULT_FADE_COOLDOWN_MS

      const now = performance.now()
      const timeSinceLast = now - (lastFadeTriggerRef.current || 0)
      const allowTrigger =
        timeSinceLast >= (fadeCooldownMsVal || DEFAULT_FADE_COOLDOWN_MS)

      const sessionDir = 'down'
      if (lastTriggeredDirRef.current !== sessionDir) {
        if (allowTrigger) {
          lastFadeTriggerRef.current = now
          const sessionId = makeSessionId()

          // compute forcedBlend target (snap camera to nearest brick)
          try {
            const rawOffset = THREE.MathUtils.clamp(scroll.offset, 0, 1)
            const tParam = startAt === 'top' ? 1 - rawOffset : rawOffset
            const count = Math.max(1, Math.floor(brickCount))
            const approxIdx = Math.floor(tParam * count)
            const brickIndex = THREE.MathUtils.clamp(approxIdx, 0, count - 1)
            const brickT = (brickIndex + 0.5) / count
            const localPoint = curve
              .getPointAt(brickT)
              .clone()
              .multiplyScalar(pathScale)
            const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
            if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
            const outwardDist = (brickSpec.depth / 2 + radialOffset) * pathScale
            const outward = radial.clone().multiplyScalar(outwardDist)
            const brickLocalPos = new THREE.Vector3(
              localPoint.x + outward.x,
              localPoint.y,
              localPoint.z + outward.z
            )
            const groupMat = ensureMatrixWorld()
            const worldPos = brickLocalPos.clone().applyMatrix4(groupMat)

            const zAxis_brick = radial.clone().normalize()
            const yAxis_brick = new THREE.Vector3(0, 1, 0)
            const xAxis_brick = new THREE.Vector3()
              .crossVectors(yAxis_brick, zAxis_brick)
              .normalize()
            const yOrtho = new THREE.Vector3()
              .crossVectors(zAxis_brick, xAxis_brick)
              .normalize()
            const groupQuat = new THREE.Quaternion().setFromRotationMatrix(groupMat)
            const camZ = zAxis_brick
              .clone()
              .multiplyScalar(-1)
              .applyQuaternion(groupQuat)
              .normalize()
            const camY = yOrtho.clone().applyQuaternion(groupQuat).normalize()
            const camX = new THREE.Vector3().crossVectors(camY, camZ).normalize()
            const camBasisMat = new THREE.Matrix4().makeBasis(camX, camY, camZ)
            const camQuatFromBasis = new THREE.Quaternion().setFromRotationMatrix(camBasisMat)
            const camEuler = new THREE.Euler().setFromQuaternion(camQuatFromBasis, 'YXZ')
            if (mode === 'oppositeSide' || mode === 'oppositeSideMove') camEuler.y += Math.PI
            camEuler.y += THREE.MathUtils.degToRad(yOffsetDeg)
            camEuler.x += THREE.MathUtils.degToRad(xOffsetDeg || 0)
            camEuler.z += THREE.MathUtils.degToRad(zOffsetDeg || 0)
            const finalQuat = new THREE.Quaternion().setFromEuler(camEuler)

            if (cameraRef && cameraRef.current) {
              forcedBlendRef.current.active = true
              forcedBlendRef.current.startTime = performance.now()
              forcedBlendRef.current.duration = forcedBlendMsVal
              forcedBlendRef.current.fromPos = cameraRef.current.position.clone()
              forcedBlendRef.current.fromQuat = cameraRef.current.quaternion.clone()
              forcedBlendRef.current.toPos = worldPos.clone()
              forcedBlendRef.current.toQuat = finalQuat.clone()
              forcedBlendRef.current.sessionId = sessionId
              forcedBlendRef.current.sessionDir = sessionDir
            }
          } catch (e) {
            console.warn('[FORCED BLEND] compute failed', e)
          }

          // soft pause
          softPauseRef.current = { active: true, start: performance.now(), duration: 1000 }

          // ensure camera used next frame
          requestAnimationFrame(() => {
            try { set({ camera: cameraRef.current }) } catch (e) {}
          })

          // Build controller object: ONLY ENTER for down direction.
          let controller = {
            sessionId,
            enter: false,
            entered: false,
            exit: false,
            exited: false,
            color,
            forcedBlendMs: forcedBlendMsVal,
            fadeExitMs: fadeExitMsVal,
            fadeHoldMs: fadeHoldMsVal,
            sessionDir
          }

          const enterAllowed =
            (guiFadeDefaults.downEnterEnabled ?? window._springFadeDefaults?.downEnterEnabled ?? true)
          if (enterAllowed) {
            controller.enter = true
          }

          window._springFadeController = controller
          window._springFadeDefaults = {
            forcedBlendMs: forcedBlendMsVal,
            fadeExitMs: fadeExitMsVal,
            fadeHoldMs: fadeHoldMsVal,
            fadeCooldownMs: fadeCooldownMsVal,
            fadeColor: color,
            upEnterEnabled: guiFadeDefaults.upEnterEnabled,
            upExitEnabled: guiFadeDefaults.upExitEnabled,
            downEnterEnabled: guiFadeDefaults.downEnterEnabled,
            downExitEnabled: guiFadeDefaults.downExitEnabled,
            overrideStartSec: AUTOSTART_SEC
          }

          lastTriggeredDirRef.current = sessionDir
        } else {
          // cooldown blocked -> refresh defaults
          window._springFadeDefaults = {
            forcedBlendMs: forcedBlendMsVal,
            fadeExitMs: fadeExitMsVal,
            fadeHoldMs: fadeHoldMsVal,
            fadeCooldownMs: fadeCooldownMsVal,
            fadeColor: color,
            upEnterEnabled: guiFadeDefaults.upEnterEnabled,
            upExitEnabled: guiFadeDefaults.upExitEnabled,
            downEnterEnabled: guiFadeDefaults.downEnterEnabled,
            downExitEnabled: guiFadeDefaults.downExitEnabled,
            overrideStartSec: AUTOSTART_SEC
          }
        }
      } else {
        // already triggered for this direction -> keep defaults
        window._springFadeDefaults = {
          forcedBlendMs: forcedBlendMsVal,
          fadeExitMs: fadeExitMsVal,
          fadeHoldMs: fadeHoldMsVal,
          fadeCooldownMs: fadeCooldownMsVal,
          fadeColor: color,
          upEnterEnabled: guiFadeDefaults.upEnterEnabled,
          upExitEnabled: guiFadeDefaults.upExitEnabled,
          downEnterEnabled: guiFadeDefaults.downEnterEnabled,
          downExitEnabled: guiFadeDefaults.downExitEnabled,
          overrideStartSec: AUTOSTART_SEC
        }
      }
    } else {
      // crossedStart but NOT directionDown -> ignore fade; refresh defaults to keep UI in sync
      if (crossedStart && !directionDown) {
        const defaults =
          (typeof window !== 'undefined' && window._springFadeDefaults) ||
          guiFadeDefaults ||
          {}
        window._springFadeDefaults = {
          ...defaults,
          overrideStartSec: AUTOSTART_SEC
        }
      }
    }

    // Update prevSeqPos for next frame
    prevSeqPosRef.current = seqPosSeconds
    // ---------------- end START handling ----------------
  })

  // main camera/bricks logic (runs every frame)
  useFrame((state, delta) => {
    if (!scroll || !springGroupRef.current || !cameraRef.current) return

    const rawOffset = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    const t = startAt === 'top' ? 1 - rawOffset : rawOffset

    // --- BRICKS: keep discrete brick computation for brick visuals/activeIndex ---
    const count = Math.max(1, Math.floor(brickCount))
    const targetIndexF = t * count

    bricksActiveRef.current = targetIndexF
    activeIndexRef.current = bricksActiveRef.current

    const cur = smoothedIndexRef.current || 0
    let diff = targetIndexF - cur
    const absDiff = Math.abs(diff)

    const baseLerp =
      1 - Math.exp(-Math.max(0.0001, scrollResponsiveness) * 60 * delta)
    const scale =
      1 - Math.min(1, (absDiff * startupBias) / Math.max(1, count * 0.25))
    let lerpFactor = baseLerp * (0.2 + 0.8 * scale)

    // scroll speed multiplier support
    const speedMult = Math.max(
      0.001,
      typeof scrollSpeedMultiplier !== 'undefined' ? scrollSpeedMultiplier : 1.0
    )
    const maxStepEffective = Math.max(0.001, maxStep) * (delta * 60) * speedMult

    let step = diff * lerpFactor
    if (Math.abs(step) > maxStepEffective)
      step = Math.sign(step) * maxStepEffective

    const next = cur + step
    smoothedIndexRef.current = next

    const approxIdx = Math.floor(t * count)
    const brickIndex = THREE.MathUtils.clamp(approxIdx, 0, count - 1)
    const brickT = (brickIndex + 0.5) / count

    const localPoint = curve.getPointAt(brickT).clone()
    const worldPointLocalUnits = localPoint.clone().multiplyScalar(pathScale)

    const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
    if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
    const outwardDist = (brickSpec.depth / 2 + radialOffset) * pathScale
    const outward = radial.clone().multiplyScalar(outwardDist)

    const zAxis_brick = radial.clone().normalize()
    const yAxis_brick = new THREE.Vector3(0, 1, 0)
    const xAxis_brick = new THREE.Vector3()
      .crossVectors(yAxis_brick, zAxis_brick)
      .normalize()
    const yOrtho = new THREE.Vector3()
      .crossVectors(zAxis_brick, xAxis_brick)
      .normalize()

    const brickLocalPos = new THREE.Vector3(
      worldPointLocalUnits.x + outward.x,
      worldPointLocalUnits.y,
      worldPointLocalUnits.z + outward.z
    )
    const brickMat = new THREE.Matrix4().makeBasis(
      xAxis_brick,
      yOrtho,
      zAxis_brick
    )
    const brickQuat = new THREE.Quaternion().setFromRotationMatrix(brickMat)

    const groupMatrix = ensureMatrixWorld()
    const brickWorldPos = brickLocalPos.clone().applyMatrix4(groupMatrix)
    const groupQuat = new THREE.Quaternion().setFromRotationMatrix(groupMatrix)
    const brickWorldQuat = brickQuat.clone().premultiply(groupQuat)

    // ----------------- CAMERA: continuous along path (KEY) -----------------
    const contLocal = curve.getPointAt(t).clone().multiplyScalar(pathScale)
    const contRadial = new THREE.Vector3(
      contLocal.x,
      0,
      contLocal.z
    ).normalize()
    if (!isFinite(contRadial.x) || contRadial.lengthSq() < 1e-6)
      contRadial.set(1, 0, 0)
    const contOutwardDist = (brickSpec.depth / 2 + radialOffset) * pathScale
    const contOutward = contRadial.clone().multiplyScalar(contOutwardDist)

    let sign = 1
    let extraAcrossMoveLocal = 0
    if (mode === 'normal') sign = 1
    else if (mode === 'oppositeSide') sign = -1
    else if (mode === 'oppositeSideMove') {
      sign = -1
      extraAcrossMoveLocal = brickSpec.width * pathScale * 0.6
    }

    const cameraLocalOffset = new THREE.Vector3(
      -extraAcrossMoveLocal,
      cameraUpOffset +
        sign * ((brickSpec.width / 2) * pathScale + cameraSideOffset),
      0
    )

    const contZAxis = contRadial.clone().normalize()
    const contYAxis = new THREE.Vector3(0, 1, 0)
    const contXAxis = new THREE.Vector3()
      .crossVectors(contYAxis, contZAxis)
      .normalize()
    const contYOrtho = new THREE.Vector3()
      .crossVectors(contZAxis, contXAxis)
      .normalize()
    const contMat = new THREE.Matrix4().makeBasis(
      contXAxis,
      contYOrtho,
      contZAxis
    )
    const contQuat = new THREE.Quaternion().setFromRotationMatrix(contMat)

    const contBaseWorld = contLocal
      .clone()
      .add(contOutward)
      .applyMatrix4(groupMatrix)
    const cameraOffsetWorld = cameraLocalOffset
      .clone()
      .applyQuaternion(contQuat)
    const camDesiredWorld = contBaseWorld.clone().add(cameraOffsetWorld)

    const camZ = contZAxis
      .clone()
      .multiplyScalar(-1)
      .applyQuaternion(groupQuat)
      .normalize()
    const camY = contYOrtho.clone().applyQuaternion(groupQuat).normalize()
    const camX = new THREE.Vector3().crossVectors(camY, camZ).normalize()
    const camBasisMat = new THREE.Matrix4().makeBasis(camX, camY, camZ)
    const camQuatFromBasis = new THREE.Quaternion().setFromRotationMatrix(
      camBasisMat
    )
    const camEuler = new THREE.Euler().setFromQuaternion(
      camQuatFromBasis,
      'YXZ'
    )

    const progress = typeof t === 'number' ? THREE.MathUtils.clamp(t, 0, 1) : 0
    const extraPitchDeg = 5 * progress
    camEuler.x += THREE.MathUtils.degToRad(extraPitchDeg)

    if (mode === 'oppositeSide' || mode === 'oppositeSideMove')
      camEuler.y += Math.PI
    camEuler.y += THREE.MathUtils.degToRad(yOffsetDeg)
    camEuler.x += THREE.MathUtils.degToRad(xOffsetDeg || 0)
    camEuler.z += THREE.MathUtils.degToRad(zOffsetDeg || 0)

    const maxPitchRad = THREE.MathUtils.degToRad(
      Math.max(0, Math.min(90, maxPitchDeg || 90))
    )
    camEuler.x = THREE.MathUtils.clamp(camEuler.x, -maxPitchRad, maxPitchRad)
    const camFinalQuat = new THREE.Quaternion().setFromEuler(camEuler)

    // clamp Y
    if (camDesiredWorld.y < minCamY) camDesiredWorld.y = minCamY
    if (camDesiredWorld.y > maxCamY) camDesiredWorld.y = maxCamY

    // enforce min distance from base point
    const minDist = Math.max(1, minCameraDistance)
    const fromBrick = camDesiredWorld.clone().sub(contBaseWorld)
    const distFromBrick = fromBrick.length()
    if (distFromBrick < minDist) {
      const dir =
        fromBrick.length() > 1e-6
          ? fromBrick.normalize()
          : camZ.clone().multiplyScalar(-1)
      camDesiredWorld.copy(contBaseWorld).add(dir.multiplyScalar(minDist))
    }

    // compute soft-pause factor (0..1)
    let pauseFactor = 1.0
    if (softPauseRef.current && softPauseRef.current.active) {
      const now = performance.now()
      const { start, duration } = softPauseRef.current
      const u = duration > 0 ? (now - start) / duration : 1
      if (u >= 1) {
        softPauseRef.current.active = false
        pauseFactor = 1.0
      } else if (u <= 0) {
        pauseFactor = 0.0
      } else {
        const easeU = u * u * (3 - 2 * u)
        pauseFactor = easeU
      }
    }

    // forced blend override (if active)
    if (forcedBlendRef.current.active && cameraRef.current) {
      const now = performance.now()
      const fb = forcedBlendRef.current
      const elapsed = Math.max(0, now - fb.startTime)
      const u = Math.min(1, fb.duration <= 0 ? 1 : elapsed / fb.duration)
      const easeU = u * u * (3 - 2 * u)
      cameraRef.current.position.lerpVectors(fb.fromPos, fb.toPos, easeU)
      cameraRef.current.quaternion.slerpQuaternions(
        fb.fromQuat,
        fb.toQuat,
        easeU
      )
      cameraRef.current.updateMatrixWorld()

      if (u >= 1) {
        forcedBlendRef.current.active = false
        window._springSuppressTheatreResume = true

        const ctrl = window._springFadeController || null
        if (
          ctrl &&
          ctrl.sessionId &&
          fb.sessionId &&
          ctrl.sessionId === fb.sessionId
        ) {
          const sessionDir = fb.sessionDir || ctrl.sessionDir || 'down'
          const exitAllowed =
            (sessionDir === 'down' &&
              (guiFadeDefaults.downExitEnabled ?? window._springFadeDefaults?.downExitEnabled ?? true)) ||
            (sessionDir === 'up' &&
              (guiFadeDefaults.upExitEnabled ?? window._springFadeDefaults?.upEnterEnabled ?? true))

          if (exitAllowed) {
            if (!ctrl.exit && !ctrl.exited) {
              ctrl.exit = true
              window._springFadeController = ctrl
            }
          } else {
            window._springFadeController = ctrl
          }
        }

        try {
          if (sheet && sheet.sequence) {
            try {
              sheet.sequence.play()
            } catch (e) {
              console.warn('[Spring] forcedBlend->play failed', e)
            }
          }
        } catch (e) {}
      }
    } else {
      // NORMAL OVERRIDE MOVEMENT PATH (smoothing)
      if (isOverriding && cameraRef.current) {
        const desiredDelta = camDesiredWorld
          .clone()
          .sub(cameraRef.current.position)
        const maxMove = Math.max(
          0.0001,
          minDist * (state.clock.delta * 60) * (maxMovePerFrameFactor || 1)
        )

        if (desiredDelta.length() > maxMove) {
          cameraRef.current.position.add(
            desiredDelta.normalize().multiplyScalar(maxMove * pauseFactor)
          )
        } else {
          const posSmoothBase = THREE.MathUtils.clamp(
            1 - Math.exp(-positionSmoothing * 10 * delta),
            0,
            1
          )
          const posSmooth = posSmoothBase * pauseFactor
          cameraRef.current.position.lerp(camDesiredWorld, posSmooth)
        }
        const rotSmoothBase = THREE.MathUtils.clamp(
          1 - Math.exp(-rotationSmoothing * 20 * delta),
          0,
          1
        )
        const rotSmooth = rotSmoothBase * pauseFactor
        cameraRef.current.quaternion.slerp(camFinalQuat, rotSmooth)
        cameraRef.current.updateMatrixWorld()

        // stability fallback
        const posDist = cameraRef.current.position.distanceTo(camDesiredWorld)
        const q1 = cameraRef.current.quaternion
        const q2 = camFinalQuat
        const dot = Math.abs(
          THREE.MathUtils.clamp(
            q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w,
            -1,
            1
          )
        )
        const angle = 2 * Math.acos(Math.min(1, dot))
        const angleDeg = THREE.MathUtils.radToDeg(angle)
        if (posDist <= POS_THRESHOLD && angleDeg <= ANGLE_THRESHOLD_DEG) {
          stableFramesRef.current = stableFramesRef.current + 1
        } else {
          stableFramesRef.current = 0
        }
        if (stableFramesRef.current >= STABLE_REQUIRED) {
          const ctrl = window._springFadeController || {}
          if (ctrl && ctrl.sessionId && !(ctrl.exit || ctrl.exited)) {
            if (ctrl.enter) {
              const sessionDir =
                ctrl.sessionDir || forcedBlendRef.current.sessionDir || 'down'
              const exitAllowed =
                (sessionDir === 'down' &&
                  (guiFadeDefaults.downExitEnabled ?? window._springFadeDefaults?.downExitEnabled ?? true)) ||
                (sessionDir === 'up' &&
                  (guiFadeDefaults.upEnterEnabled ?? window._springFadeDefaults?.upEnterEnabled ?? true))

              if (exitAllowed) {
                ctrl.exit = true
                window._springFadeController = ctrl

                // resume theatre immediately
                try {
                  if (sheet && sheet.sequence) sheet.sequence.play()
                } catch (e) {
                  console.warn('[Spring] stability->play failed', e)
                }
              } else {
                window._springFadeController = ctrl
              }
            }
          }
        }
      } else {
        stableFramesRef.current = 0
      }
    }

    // SPRINGPATH-END detection: when smoothedIndex reaches last brick -> end override
    const epsilon = 0.0001
    const lastIndex = Math.max(0, count - 1)
    const smoothed = smoothedIndexRef.current || 0
    const reachedEnd = smoothed >= lastIndex - epsilon

    if (reachedEnd) {
      try {
        const ctrl = window._springFadeController || null
        if (ctrl && ctrl.sessionId && !(ctrl.exit || ctrl.exited)) {
          // cancel any active forcedBlend so camera returns control
          if (forcedBlendRef && forcedBlendRef.current) {
            forcedBlendRef.current.active = false
          }
          // set exit flag
          ctrl.exit = true
          window._springFadeController = ctrl

          // if user asked to force immediate exit, ensure theatre resumes
          if (guiFadeDefaults.forceImmediateExitOnEnd) {
            try {
              if (sheet && sheet.sequence) sheet.sequence.play()
            } catch (e) {}
          }

          // Attempt strong theatre-camera restoration:
          //  - try theatreCamRef.current
          //  - fallback to global window._springTheatreCam.current
          //  - try multiple animation frames with small delay until successful (max tries)
          (function tryRestoreTheatreCamera (attempt = 0) {
            try {
              // clear suppression so theatre can resume control
              window._springSuppressTheatreResume = false

              const theatreCamCandidates = [
                theatreCamRef && theatreCamRef.current,
                window._springTheatreCam && window._springTheatreCam.current,
              ]

              // pick first non-null candidate that looks like a camera
              let theatreCam = null
              for (let c of theatreCamCandidates) {
                if (c && (c.isCamera || c.isPerspectiveCamera || c.isObject3D)) {
                  theatreCam = c
                  break
                }
              }

              if (theatreCam) {
                // ensure camera has projection updated (if possible)
                try { theatreCam.updateProjectionMatrix && theatreCam.updateProjectionMatrix() } catch (e) {}

                // set three renderer's active camera
                try {
                  set({ camera: theatreCam })
                  // keep our refs consistent so overlays/readouts match
                  cameraRef.current = theatreCam
                  theatreCamRef.current = theatreCam
                } catch (e) {
                  // ignore and try again below
                }

                // try to resume theatre timeline (safe)
                try { if (sheet && sheet.sequence) sheet.sequence.play(); } catch (e) {}
              } else {
                // if no candidate yet and attempts left -> retry next RAF
                if (attempt < 4) {
                  requestAnimationFrame(() => tryRestoreTheatreCamera(attempt + 1))
                } else {
                  // final fallback: resume theatre timeline even if camera not found
                  try { if (sheet && sheet.sequence) sheet.sequence.play(); } catch (e) {}
                }
              }
            } catch (e) {
              if (attempt < 4) requestAnimationFrame(() => tryRestoreTheatreCamera(attempt + 1))
            }
          })(0)
        }
      } catch (e) {
        console.warn('[SpringEnd] enforcing exit failed', e)
      }
    }

    // set isOverriding true only after AUTOSTART_SEC and NOT after spring ended
    const sequencePtr = sheet && sheet.sequence && sheet.sequence.pointer
    let seqTime = 0
    try {
      if (sequencePtr && typeof sequencePtr.time === 'number') seqTime = sequencePtr.time
      else seqTime = Number(sheet.sequence.position || 0)
    } catch (e) { seqTime = Number(sheet.sequence.position || 0) }

    const AUTOSTART_SEC =
      typeof guiFadeDefaults.overrideStartSec === 'number'
        ? guiFadeDefaults.overrideStartSec
        : window._springFadeDefaults?.overrideStartSec || 10

    const shouldBeOverriding = seqTime >= AUTOSTART_SEC && !reachedEnd
    setIsOverriding(shouldBeOverriding)

    if (sphereRef.current) {
      sphereRef.current.visible = showDebugMarker
      if (showDebugMarker) sphereRef.current.position.copy(brickWorldPos)
    }

    // finally update lastRawRef so direction detection works next frame
    lastRawRef.current = rawOffset
  })

  return (
    <>
      {isOverriding ? (
        <perspectiveCamera
          ref={cameraRef}
          makeDefault
          near={0.1}
          far={6000}
          fov={40}
          position={[0, 2, 10]}
        />
      ) : (
        <PerspectiveCamera
          ref={inst => {
            cameraRef.current = inst
            theatreCamRef.current = inst
            // also keep a global handle for debugging/restore
            window._springTheatreCam = window._springTheatreCam || { current: inst }
            window._springTheatreCam.current = inst
          }}
          theatreKey='Camera'
          makeDefault
          near={0.1}
          far={6000}
          fov={40}
        />
      )}

      <CameraDebugGUI cameraRef={cameraRef} isOverriding={isOverriding} />

      <group ref={wrapperRef}>
        <e.group
          theatreKey='SpringGroup'
          ref={springGroupRef}
          position={[0, 0, 0]}
        >
          <SpringPath
            count={brickCount}
            turns={turns}
            coilRadius={coilRadius}
            height={pathHeight}
            scale={pathScale}
            radialOffset={radialOffset}
            texturePath='/textures/brick-texture.jpg'
            hiddenDepth={hiddenDepth}
            activationRange={activationRange}
            riseSpeed={riseSpeed}
            debugShowBricks={true}
            debugForceProgress={true}
            debugFallbackMeshes={true}
            activeIndexRef={bricksActiveRef}
            activeRadius={activeRadius}
            activeFade={activeFade}
            downAmplitude={downAmplitude}
            frontHold={frontHold}
            curvatureEnabled={curvatureEnabled}
            curvatureStrength={curvatureStrength}
            curvatureRange={curvatureRange}
            curvatureFalloff={curvatureFalloff}
            floatEnabled={floatEnabled}
            floatSpeed={floatSpeed}
            rotationIntensity={rotationIntensity}
            floatIntensity={floatIntensity}
            floatingRange={floatingRange}
            riseSmoothing={riseSmoothing}
            wave={{ enabled: false }}
          />
        </e.group>

        <mesh ref={sphereRef} visible>
          <sphereGeometry args={[SPHERE_RADIUS, 12, 10]} />
          <meshStandardMaterial
            color={'#ff4444'}
            metalness={0.1}
            roughness={0.4}
          />
        </mesh>
        <e.group theatreKey='RockStone' position={[0, 0, -1]}>
          <RockStone scale={30} />
        </e.group>

  

       <Suspense fallback={null}>
    <e.group theatreKey='JellyFish' position={[0, 0, -1]}>
  <JellyFishRipple
    url="/models/JellyFish.ply"
    scale={50}
  />
</e.group>
  </Suspense>


      </group>

      


      <Suspense fallback={null}>
        <Enveremnt />
      </Suspense>
    </>
  )
}
