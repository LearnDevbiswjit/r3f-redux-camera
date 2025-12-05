// src/components/CameraRig.jsx
import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useSelector } from 'react-redux'
import { useRegistry } from '../registry/TimelineRegistryContext'
import Briks from '../Briks' // adjust path if necessary

function makeHelixPoints({ turns = 2, height = 80, radius = 18, points = 2000 }) {
  const arr = []
  for (let i = 0; i <= points; i++) {
    const t = i / points
    const angle = t * turns * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const y = height * (1 - t)
    arr.push(new THREE.Vector3(x, y, z))
  }
  return arr
}

function buildArcLengthLUT(curve, samples = 1000) {
  const u = []
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const uu = i / samples
    u.push(uu)
    pts.push(curve.getPoint(uu))
  }
  const s = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += pts[i].distanceTo(pts[i - 1])
    s.push(total)
  }
  return { uSamples: u, sSamples: s, totalLength: total, pts }
}

function mapArcToU(lut, arcNorm) {
  const sTarget = Math.max(0, Math.min(1, arcNorm)) * lut.totalLength
  let lo = 0, hi = lut.sSamples.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (lut.sSamples[mid] < sTarget) lo = mid + 1
    else hi = mid - 1
  }
  const i = Math.max(1, lo)
  const s0 = lut.sSamples[i - 1]
  const s1 = lut.sSamples[i]
  const u0 = lut.uSamples[i - 1]
  const u1 = lut.uSamples[i]
  const t = s1 === s0 ? 0 : (sTarget - s0) / (s1 - s0)
  const u = u0 + (u1 - u0) * t
  return Math.max(0, Math.min(1, u))
}

export default function CameraRig({
  initialHelixConfig = { turns: 10, height: 80, radius: 18, points: 2000 },
  lutSamples = 1500
}) {
  const { camera } = useThree()
  const registry = useRegistry()

  const camState = useSelector(s => s.camera)
  const timelineOverall = useSelector(s => s.timeline.overallProgress)
  const durations = useSelector(s => s.timeline.durations)

  // local copies of control values (will be filled from global __LEVA_CAMERA_STATE__)
  const controlsRef = useRef({
    turns: initialHelixConfig.turns,
    height: initialHelixConfig.height,
    radius: initialHelixConfig.radius,
    points: initialHelixConfig.points,
    initialYawDeg: 90,
    blendDuration: 0.8,
    showBriks: true,
    pathScale: 5,
    brickSpacing: 10,
    brickScale: 1,
    brickPathColor: '#ff3b30',
    camOffsetX: 0,
    camOffsetY: 0,
    camOffsetZ: 0,
    camRotDegX: 0,
    camRotDegY: 0,
    camRotDegZ: 0,
    tightFollow: true,
    damping: 6
  })

  const curveRef = useRef(null)
  const lutRef = useRef(null)
  const ptsRef = useRef([])
  const desired = useRef(new THREE.Vector3())
  const tmp = useRef(new THREE.Vector3())

  const prevMode = useRef(camState.mode)
  const blendT = useRef(1)
  const blendDurationRef = useRef(0.8)
  const initialYawOffsetRad = useRef(THREE.MathUtils.degToRad(90))

  // helper: read leva values into controlsRef (called each frame)
  function syncControlsFromGlobal() {
    if (typeof window === 'undefined') return
    const g = window.__LEVA_CAMERA_STATE__ || {}
    // update only known keys to avoid noise
    const keys = Object.keys(controlsRef.current)
    for (const k of keys) {
      if (g[k] !== undefined) controlsRef.current[k] = g[k]
    }
    // ensure numeric conversions
    blendDurationRef.current = Math.max(0.0001, Number(controlsRef.current.blendDuration) || 0.8)
    initialYawOffsetRad.current = THREE.MathUtils.degToRad(Number(controlsRef.current.initialYawDeg) || 0)
  }

  // build helix from controlsRef (call when helix params change)
  function rebuildHelix() {
    const cfg = {
      turns: Number(controlsRef.current.turns) || initialHelixConfig.turns,
      height: Number(controlsRef.current.height) || initialHelixConfig.height,
      radius: Number(controlsRef.current.radius) || initialHelixConfig.radius,
      points: Number(controlsRef.current.points) || initialHelixConfig.points
    }
    const pts = makeHelixPoints(cfg)
    ptsRef.current = pts
    curveRef.current = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
    lutRef.current = buildArcLengthLUT(curveRef.current, Math.max(300, lutSamples))
  }

  // initial build
  useEffect(() => {
    syncControlsFromGlobal()
    rebuildHelix()
    // register camera helper
    registry.setCameraRef({
      camera,
      smoothJumpToTransform: ({ pos, quat }, duration = 0.6) => {
        if (!pos || !quat) {
          camera.position.copy(pos || camera.position)
          camera.quaternion.copy(quat || camera.quaternion)
          camera.updateMatrixWorld()
          return
        }
        if (window.gsap) {
          const p = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
          window.gsap.to(p, {
            x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power2.inOut', onUpdate() {
              camera.position.set(p.x, p.y, p.z)
            }
          })
          const startQuat = camera.quaternion.clone()
          const endQuat = quat.clone()
          let t = { v: 0 }
          window.gsap.to(t, { v: 1, duration, ease: 'power2.inOut', onUpdate() {
            THREE.Quaternion.slerp(startQuat, endQuat, camera.quaternion, t.v)
          }})
        } else {
          camera.position.copy(pos)
          camera.quaternion.copy(quat)
        }
      },
      getHelixStartPosition: () => {
        if (!curveRef.current || !lutRef.current) return null
        const u0 = mapArcToU(lutRef.current, 0)
        return curveRef.current.getPoint(u0)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // watch for changes in the global leva state and rebuild helix if helix params changed
  useEffect(() => {
    let lastSig = null
    const id = setInterval(() => {
      const g = typeof window !== 'undefined' ? window.__LEVA_CAMERA_STATE__ || {} : {}
      const sig = `${g.turns}|${g.height}|${g.radius}|${g.points}`
      if (sig !== lastSig) {
        // update controlsRef and rebuild
        syncControlsFromGlobal()
        rebuildHelix()
        lastSig = sig
      } else {
        // still sync other params (offsets etc.)
        syncControlsFromGlobal()
      }
    }, 120) // cheap poll; keeps Canvas-root in-sync with Leva outside root
    return () => clearInterval(id)
  }, [])

  // helper overall->helix mapping
  function overallToHelixLocal(overall, durationsObj = { theatreA: 0, helix: 1, theatreB: 0 }) {
    const d = durationsObj || { theatreA: 0, helix: 1, theatreB: 0 }
    const total = Math.max(1e-6, (d.theatreA || 0) + (d.helix || 0) + (d.theatreB || 0))
    const tA = (d.theatreA || 0) / total
    const tH = (d.helix || 0) / total
    if (overall <= tA) return 0
    if (overall >= tA + tH) return 1
    return Math.max(0, Math.min(1, (overall - tA) / tH))
  }

  useFrame((_, dt) => {
    if (!curveRef.current || !lutRef.current) return
    if (camState.locked) return

    // always keep controls up-to-date
    syncControlsFromGlobal()

    if (prevMode.current !== camState.mode) {
      if (camState.mode === 'helix') blendT.current = 0
      else blendT.current = 1
      prevMode.current = camState.mode
    }

    let arcNorm = 0
    if (typeof camState.progress === 'number' && camState.mode === 'helix') {
      arcNorm = camState.progress
    } else {
      arcNorm = overallToHelixLocal(timelineOverall, durations)
    }
    arcNorm = Math.max(0, Math.min(1, arcNorm))

    if (camState.mode !== 'helix' && !(arcNorm > 0 && arcNorm < 1)) return

    if (blendT.current < 1) blendT.current = Math.min(1, blendT.current + (dt / blendDurationRef.current))

    const u = mapArcToU(lutRef.current, arcNorm)
    const p = curveRef.current.getPoint(u)

    const camOffsetX = Number(controlsRef.current.camOffsetX) || 0
    const camOffsetY = Number(controlsRef.current.camOffsetY) || 0
    const camOffsetZ = Number(controlsRef.current.camOffsetZ) || 0
    const tightFollow = !!controlsRef.current.tightFollow
    const damping = Number(controlsRef.current.damping) || 6

    desired.current.set(p.x + camOffsetX, p.y + camOffsetY, p.z + camOffsetZ)

    if (tightFollow) {
      camera.position.copy(desired.current)
    } else {
      tmp.current.copy(camera.position)
      const lambda = 1 - Math.exp(-Math.max(0.0001, damping) * dt)
      tmp.current.lerp(desired.current, lambda)
      camera.position.copy(tmp.current)
    }

    const aheadU = Math.min(1, u + 0.001)
    const tan = curveRef.current.getTangent(aheadU)
    const curveYaw = Math.atan2(tan.x, tan.z)

    const offset = initialYawOffsetRad.current || 0
    const startYaw = curveYaw + offset
    const twoPI = Math.PI * 2
    const diff = ((curveYaw - startYaw + Math.PI) % (twoPI)) - Math.PI
    const blendedYaw = startYaw + diff * blendT.current

    const extraYaw = THREE.MathUtils.degToRad(Number(controlsRef.current.camRotDegY) || 0)
    const finalYaw = blendedYaw + extraYaw

    const rotX = THREE.MathUtils.degToRad(Number(controlsRef.current.camRotDegX) || 0)
    const rotZ = THREE.MathUtils.degToRad(Number(controlsRef.current.camRotDegZ) || 0)

    const euler = new THREE.Euler(rotX, finalYaw, rotZ, 'YXZ')
    camera.quaternion.setFromEuler(euler)
  })

  return (
    <>
      {controlsRef.current.showBriks && ptsRef.current && ptsRef.current.length > 0 && (
        <Briks
          points={ptsRef.current}
          pathScale={controlsRef.current.pathScale}
          brickSpacing={controlsRef.current.brickSpacing}
          brickScale={controlsRef.current.brickScale}
          pathColor={controlsRef.current.brickPathColor}
        />
      )}
    </>
  )
}
