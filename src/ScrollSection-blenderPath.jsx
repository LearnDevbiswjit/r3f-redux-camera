// src/ScrollSection.jsx
import * as THREE from 'three'
import React, { useRef, useMemo, Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ScrollControls, useScroll, Scroll } from '@react-three/drei'
import { getProject, val } from '@theatre/core'
import theatreeBBState from './theatreState.json'
import { editable as e, SheetProvider, PerspectiveCamera } from '@theatre/r3f'
import studio from '@theatre/studio'
import extension from '@theatre/r3f/dist/extension'
studio.initialize()
studio.extend(extension)

import WaterScene from './component/WaterScene.jsx'
import Enveremnt from './Enveremnt.jsx'
import SpringPath from './SpringPath.jsx'
import { Leva, useControls, monitor } from 'leva'

/* ---------------- small helpers & config ---------------- */
const PAGES = 8
const DEFAULT_FORCED_BLEND_MS = 500
const DEFAULT_FADE_EXIT_MS = 500
const DEFAULT_FADE_HOLD_MS = 20
const DEFAULT_FADE_COOLDOWN_MS = 300

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

/* ---------------- Camera debug GUI ---------------- */
function CameraDebugGUI ({ cameraRef, isOverriding }) {
  useControls(
    'Camera Debug',
    {
      OverrideActive: monitor(() => (isOverriding ? 'YES' : 'no'), { interval: 250 }),
      PositionXYZ: monitor(() => {
        const c = cameraRef.current
        if (!c) return '—'
        const p = c.position
        return `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`
      }, { interval: 250 }),
      RotationEulerDeg_YXZ: monitor(() => {
        const c = cameraRef.current
        if (!c) return '—'
        const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ')
        return `${THREE.MathUtils.radToDeg(e.x).toFixed(1)}, ${THREE.MathUtils.radToDeg(e.y).toFixed(1)}, ${THREE.MathUtils.radToDeg(e.z).toFixed(1)}`
      }, { interval: 250 })
    },
    { collapsed: false }
  )
  return null
}

/* ---------------- Main ScrollSection ---------------- */
export default function ScrollSection () {
  const project = getProject('myProject', { state: theatreeBBState })
  window.__THEATRE_PROJECT__ = project
  const sheet = project.sheet('Scene')

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const pages = isMobile ? 9 : PAGES

  // Leva small fade controls (keep minimal)
  const { forcedBlendMs, fadeExitMs, fadeHoldMs, fadeCooldownMs } = useControls('Fade', {
    forcedBlendMs: { value: DEFAULT_FORCED_BLEND_MS, min: 50, max: 3000, step: 10 },
    fadeExitMs: { value: DEFAULT_FADE_EXIT_MS, min: 50, max: 3000, step: 10 },
    fadeHoldMs: { value: DEFAULT_FADE_HOLD_MS, min: 0, max: 2000, step: 10 },
    fadeCooldownMs: { value: DEFAULT_FADE_COOLDOWN_MS, min: 0, max: 2000, step: 10 }
  })

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <Leva hidden={isMobile} />
      <Canvas
        shadows
        style={{ width: '100vw', height: '100vh' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1
        }}
      >
        <Suspense fallback={null}>
          <WaterScene />
          <ScrollControls pages={pages} distance={3} damping={0.15}>
            <SheetProvider sheet={sheet}>
              <Scene sheet={sheet} />
            </SheetProvider>
            <Scroll html style={{ position: 'absolute', width: '100vw' }} />
          </ScrollControls>
        </Suspense>
      </Canvas>
    </div>
  )
}

/* ---------------- Scene which uses global blender curve if present ---------------- */
function Scene ({ sheet }) {
  const scroll = useScroll()
  const { set } = useThree()

  const cameraRef = useRef()
  const theatreCamRef = useRef()
  const springGroupRef = useRef()
  const sphereRef = useRef()
  const wrapperRef = useRef()

  // state refs for override/behavior (kept minimal here)
  const [isOverriding, setIsOverriding] = useState(false)
  const activeIndexRef = useRef(0)
  const smoothedIndexRef = useRef(0)
  const lastRawRef = useRef(0)
  const forcedBlendRef = useRef({ active: false, startTime: 0, duration: 500, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), toQuat: new THREE.Quaternion() })

  // helix fallback used for bricks visuals (SpringPath draws bricks)
  const helixCurve = useMemo(() => new HelixCurve({ turns: 0.95, radius: 7.0, height: 10 }), [])

  // map scroll to theatre (only when theatre not suppressed)
  useFrame(() => {
    if (!sheet || !scroll) return
    try {
      const sequenceLength = Math.max(1, Number(val(sheet.sequence.pointer.length) || 1))
      if (!window._springSuppressTheatreResume) {
        sheet.sequence.position = scroll.offset * sequenceLength
      }
    } catch (e) {}
  })

  // camera follow loop: use window._springBlenderCurve (set by SpringPath) if available, else use helix
  useFrame((state) => {
    if (!scroll || !cameraRef.current) return
    const rawOffset = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    const t = rawOffset

    const camCurve = (typeof window !== 'undefined' && window._springBlenderCurve) ? window._springBlenderCurve : helixCurve
    const pathScale = 5
    // sample point+tangent
    const point = new THREE.Vector3()
    if (camCurve.getPointAt) camCurve.getPointAt(t, point)
    else camCurve.getPoint(t, point)
    point.multiplyScalar(pathScale)

    // tangent
    const tangent = new THREE.Vector3()
    if (camCurve.getTangentAt) camCurve.getTangentAt(t, tangent)
    else {
      const eps = 1 / 1000
      const t0 = Math.max(0, t - eps), t1 = Math.min(1, t + eps)
      const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
      camCurve.getPointAt ? camCurve.getPointAt(t0, p0) : camCurve.getPoint(t0, p0)
      camCurve.getPointAt ? camCurve.getPointAt(t1, p1) : camCurve.getPoint(t1, p1)
      tangent.copy(p1).sub(p0).normalize()
    }

    // desired camera position: slight outward offset based on radial
    const radial = new THREE.Vector3(point.x, 0, point.z).normalize()
    if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
    const outward = radial.clone().multiplyScalar( ( (4 / 2) + 0 ) * pathScale ) // using sample brick depth 4
    const camDesired = point.clone().add(outward).add(new THREE.Vector3(0, 2, 0))

    // set camera directly (simple smoothing)
    cameraRef.current.position.lerp(camDesired, 0.85)
    // rotation: compute yaw from tangent, lock pitch/roll small
    const proj = new THREE.Vector3(tangent.x, 0, tangent.z)
    if (proj.lengthSq() < 1e-6) proj.set(0, 0, 1)
    proj.normalize()
    const yaw = Math.atan2(proj.x, proj.z)
    const fixedPitchRad = THREE.MathUtils.degToRad(-8)
    const desiredQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(fixedPitchRad, yaw, 0, 'YXZ'))
    cameraRef.current.quaternion.slerp(desiredQuat, 0.92)
    cameraRef.current.updateMatrixWorld()
  })

  // expose camera handle
  useEffect(() => { window._springCamRef = cameraRef }, [cameraRef])

  return (
    <>
      {/* default camera switches between theatre camera and three camera based on simple override */}
      <PerspectiveCamera
        ref={inst => {
          if (!inst) return
          cameraRef.current = inst
          theatreCamRef.current = inst
          window._springTheatreCam = window._springTheatreCam || { current: inst }
          window._springTheatreCam.current = inst
        }}
        theatreKey='Camera'
        makeDefault
        fov={40}
        near={0.1}
        far={6000}
      />

      <CameraDebugGUI cameraRef={cameraRef} isOverriding={false} />

      <group ref={wrapperRef}>
        <e.group theatreKey='SpringGroup' ref={springGroupRef} position={[0, 0, 0]}>
          {/* SpringPath loads blender_path.json internally and sets window._springBlenderCurve */}
          <SpringPath
            count={48}
            turns={0.95}
            coilRadius={7.0}
            height={10}
            scale={5}
            radialOffset={0}
            texturePath='/textures/brick-texture.jpg'
            showPath={true}
            pathColor={'#00ffdd'}
            activeIndexRef={activeIndexRef}
            activeRadius={3}
            activeFade={3}
            downAmplitude={7}
            frontHold={1}
            curvatureEnabled={true}
          />
        </e.group>

        <mesh ref={sphereRef} visible>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial color={'#ff4444'} metalness={0.1} roughness={0.4} />
        </mesh>

        <Suspense fallback={null}>
          <Enveremnt />
        </Suspense>
      </group>
    </>
  )
}
