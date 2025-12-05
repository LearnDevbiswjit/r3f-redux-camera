// src/SpringPath.jsx
import React, { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useLoader, useFrame, useThree } from '@react-three/fiber'

/**
 * SpringPath.jsx
 * - আগের SpringPath-এর মেজর লজিক রাখা আছে (instanced bricks, shader patching)
 * - পরিবর্তন: যদি public/blender_path.json পাওয়া যায়, সেটার থেকে point-array বের করে
 *   sampled (arc-length) curve তৈরি করবে এবং সেটাকে window._springBlenderCurve এ রাখবে
 * - ScrollSection বা Scene অন্য কোথাও এই গ্লোবাল ব্যবহার করে camera follow করতে পারবে
 */

/* ---------------- HelixCurve fallback (keeps visuals working if no JSON) ---------------- */
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

/* ---------------- Helper: build sampled (arc-length) wrapper ---------------- */
function buildSampledCurveFromPoints (pointArray3 = [], samples = 1000) {
  if (!pointArray3 || pointArray3.length < 2) return null
  const cat = new THREE.CatmullRomCurve3(pointArray3, false, 'centripetal', 0.5)
  const pts = cat.getPoints(Math.max(256, samples))
  const lens = new Float32Array(pts.length)
  let total = 0
  lens[0] = 0
  for (let i = 1; i < pts.length; i++) {
    total += pts[i].distanceTo(pts[i - 1])
    lens[i] = total
  }
  const positions = pts.map(p => p.clone())
  const cumLengths = Array.from(lens)
  const totalLen = Math.max(1e-6, total)

  function getPointAt (t, target = new THREE.Vector3()) {
    const u = isFinite(t) ? THREE.MathUtils.clamp(t, 0, 1) : 0
    const targetLen = u * totalLen
    // binary search
    let lo = 0, hi = cumLengths.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumLengths[mid] < targetLen) lo = mid + 1
      else hi = mid
    }
    const i = Math.max(1, lo)
    const l0 = cumLengths[i - 1], l1 = cumLengths[i]
    const seg = Math.max(1e-9, l1 - l0)
    const localU = THREE.MathUtils.clamp((targetLen - l0) / seg, 0, 1)
    target.lerpVectors(positions[i - 1], positions[i], localU)
    return target
  }

  function getTangentAt (t, target = new THREE.Vector3()) {
    const eps = 1 / Math.max(1000, samples)
    const t0 = Math.max(0, t - eps), t1 = Math.min(1, t + eps)
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
    getPointAt(t0, p0)
    getPointAt(t1, p1)
    target.copy(p1).sub(p0).normalize()
    return target
  }

  return { getPointAt, getTangentAt, length: totalLen, raw: positions }
}

/* ---------------- SpringPath component ---------------- */
export default function SpringPath ({
  // visual / instancing options (kept similar to your previous file)
  count = 40,
  turns = 0.95,
  coilRadius = 5.0,
  height = 10,
  scale = 5,
  brick = { width: 2, height: 2, depth: 4 },
  radialOffset = 0.0,
  texturePath = '/textures/brick-texture.jpg',
  seed = 42,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  showPath = true,
  pathColor = '#00ffff',
  pathSegments = 400,
  startOffset = 0.0,
  // behaviour
  activeIndexRef = { current: 0 },
  activeRadius = 4,
  activeFade = 3,
  downAmplitude = 7.0,
  frontHold = 1,
  curvatureEnabled = true,
  floatEnabled = false,
  floatSpeed = 1.0,
  rotationIntensity = 0.6,
  riseSmoothing = 0.12
}) {
  const instRef = useRef()
  const { scene } = useThree()

  // try load color texture (non-fatal)
  let colorMap = null
  try {
    colorMap = useLoader(THREE.TextureLoader, texturePath)
    colorMap.encoding = THREE.sRGBEncoding
    colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping
    colorMap.repeat.set(1.2, 1.0)
  } catch (e) {
    colorMap = null
  }

  // material
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: colorMap || undefined,
      roughness: 0.38,
      metalness: 0.05,
      color: new THREE.Color(0.95, 0.94, 0.95),
      side: THREE.DoubleSide
    })
  }, [colorMap])

  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(brick.width, brick.height, brick.depth, 6, 2, 2)
  }, [brick.width, brick.height, brick.depth])

  // curve choice: blenderCurve if available else helix
  const helixCurve = useMemo(() => new HelixCurve({ turns, radius: coilRadius, height }), [turns, coilRadius, height])

  // Build base matrices once
  useEffect(() => {
    const mesh = instRef.current
    if (!mesh) return
    mesh.frustumCulled = false

    const tmpMat = new THREE.Matrix4()
    const tmpPos = new THREE.Vector3()
    const tmpQuat = new THREE.Quaternion()
    const tmpScale = new THREE.Vector3(1, 1, 1)

    const baseMats = []
    let s = seed
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }

    for (let i = 0; i < count; i++) {
      const tRaw = (i + 0.5) / count
      const t = (tRaw + startOffset) % 1

      const localPoint = new THREE.Vector3()
      helixCurve.getPoint(t, localPoint) // initial placement on helix; later per-frame we will re-align if blender curve exists

      const worldPoint = localPoint.clone().multiplyScalar(scale)

      const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
      if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
      const outwardDist = (brick.depth / 2 + radialOffset) * scale
      const outward = radial.clone().multiplyScalar(outwardDist)

      tmpPos.set(worldPoint.x + outward.x + position[0], worldPoint.y + position[1], worldPoint.z + outward.z + position[2])

      const zAxis = radial.clone().normalize()
      const yAxis = new THREE.Vector3(0, 1, 0)
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize()
      const yOrtho = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize()
      const mat = new THREE.Matrix4().makeBasis(xAxis, yOrtho, zAxis)
      tmpQuat.setFromRotationMatrix(mat)

      tmpMat.compose(tmpPos, tmpQuat, tmpScale)
      mesh.setMatrixAt(i, tmpMat)

      baseMats.push({ mat: tmpMat.clone(), pos: tmpPos.clone(), meta: { phase: rand() } })
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    instRef.current.__baseMats = baseMats
  }, [count, helixCurve, scale, position, startOffset, brick.depth, radialOffset, geometry])

  // Per-frame: if blender curve present, reposition instances along blender curve,
  // else keep helix placement (this preserves previous behaviour).
  useFrame((state) => {
    const mesh = instRef.current
    if (!mesh || !mesh.__baseMats) return
    const base = mesh.__baseMats
    const camCurve = (typeof window !== 'undefined' && window._springBlenderCurve) ? window._springBlenderCurve : null
    const path = camCurve || helixCurve

    const tmpMat = new THREE.Matrix4()
    const tmpPos = new THREE.Vector3()
    const tmpQuat = new THREE.Quaternion()
    const tmpScale = new THREE.Vector3(1, 1, 1)

    const actIdxF = (activeIndexRef && activeIndexRef.current) ? activeIndexRef.current : 0
    const radius = Math.max(0, activeRadius || 0)
    const fade = Math.max(0.0001, activeFade || 1)
    const amp = downAmplitude || 0
    const front = Math.max(0, frontHold || 0)

    const perFrameLerp = 1 - Math.exp(- (Math.max(0.01, riseSmoothing) * 60) * Math.min(0.06, state.clock.delta || (1/60)))

    for (let i = 0; i < Math.min(base.length, mesh.count); i++) {
      const tRaw = (i + 0.5) / count
      const t = (tRaw + startOffset) % 1

      // sample on active path (blender or helix)
      const localPoint = new THREE.Vector3()
      path.getPointAt ? path.getPointAt(t, localPoint) : path.getPoint(t, localPoint)
      const worldPoint = localPoint.clone().multiplyScalar(scale)

      // radial/outward
      const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
      if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
      const outward = radial.clone().multiplyScalar((brick.depth / 2 + radialOffset) * scale)

      tmpPos.set(worldPoint.x + outward.x + position[0], worldPoint.y + position[1], worldPoint.z + outward.z + position[2])

      // orientation: align to path tangent
      const tangent = new THREE.Vector3()
      if (path.getTangentAt) path.getTangentAt(t, tangent)
      else {
        // fallback finite diff
        const t0 = Math.max(0, t - 0.001), t1 = Math.min(1, t + 0.001)
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
        path.getPointAt ? path.getPointAt(t0, p0) : path.getPoint(t0, p0)
        path.getPointAt ? path.getPointAt(t1, p1) : path.getPoint(t1, p1)
        tangent.copy(p1).sub(p0).normalize()
      }
      const zAxis = tangent.clone().normalize()
      if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1)
      const yAxis = new THREE.Vector3(0, 1, 0)
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize()
      const yOrtho = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize()
      const mat = new THREE.Matrix4().makeBasis(xAxis, yOrtho, zAxis)
      tmpQuat.setFromRotationMatrix(mat)

      // small float/curvature tweaks (kept simple)
      tmpMat.compose(tmpPos, tmpQuat, tmpScale)
      mesh.setMatrixAt(i, tmpMat)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  // load blender JSON once and set global curve
  useEffect(() => {
    let mounted = true
    const BLENDER_JSON = '/blender_path.json'
    fetch(BLENDER_JSON)
      .then(async (res) => {
        if (!res.ok) throw new Error('Not found: ' + BLENDER_JSON)
        const json = await res.json()
        // extract points robustly
        const extract = (obj) => {
          if (!obj) return null
          if (Array.isArray(obj)) {
            if (obj.length > 0) {
              const first = obj[0]
              if (first && typeof first === 'object' && 'x' in first && 'y' in first && 'z' in first) return obj
              if (Array.isArray(first) && first.length >= 3 && typeof first[0] === 'number') return obj
            }
          }
          if (typeof obj === 'object') {
            const keys = ['points','vertices','verts','positions','coords','data','geometry']
            for (const k of keys) {
              if (obj[k]) {
                const found = extract(obj[k])
                if (found) return found
              }
            }
            for (const k of Object.keys(obj)) {
              try {
                const found = extract(obj[k])
                if (found) return found
              } catch (e) {}
            }
          }
          return null
        }
        const raw = extract(json)
        if (!raw || raw.length < 2) {
          console.warn('[SpringPath] blender JSON: cannot locate valid points array')
          return
        }
        const pts = []
        for (let i = 0; i < raw.length; i++) {
          const p = raw[i]
          if (Array.isArray(p) && p.length >= 3) {
            const x = Number(p[0]), y = Number(p[1]), z = Number(p[2])
            if ([x,y,z].every(n => isFinite(n))) pts.push(new THREE.Vector3(x, y, z))
          } else if (p && typeof p === 'object') {
            if ('x' in p && 'y' in p && 'z' in p) {
              const x = Number(p.x), y = Number(p.y), z = Number(p.z)
              if ([x,y,z].every(n => isFinite(n))) pts.push(new THREE.Vector3(x, y, z))
            } else if (Array.isArray(p.co) && p.co.length >= 3) {
              const x = Number(p.co[0]), y = Number(p.co[1]), z = Number(p.co[2])
              if ([x,y,z].every(n => isFinite(n))) pts.push(new THREE.Vector3(x, y, z))
            }
          }
        }
        if (pts.length < 2) {
          console.warn('[SpringPath] parsed points insufficient')
          return
        }
        const sampled = buildSampledCurveFromPoints(pts, Math.max(256, pts.length))
        if (mounted && sampled) {
          // set global so ScrollSection/Scene can use camera follow
          window._springBlenderCurve = sampled
          console.log('[SpringPath] blender path loaded -> window._springBlenderCurve set (points=', pts.length, ')')
        }
      })
      .catch((err) => {
        console.warn('[SpringPath] blender load failed', err)
      })
    return () => { mounted = false }
  }, [])

  // optional visual path line (using current curve if exists)
  const pathGeometry = useMemo(() => {
    const curve = (typeof window !== 'undefined' && window._springBlenderCurve) ? window._springBlenderCurve : helixCurve
    if (!showPath || !curve) return null
    const pts = []
    const v = new THREE.Vector3()
    const segs = Math.max(64, pathSegments)
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      if (curve.getPointAt) curve.getPointAt(t, v)
      else curve.getPoint(t, v)
      pts.push(v.clone().multiplyScalar(scale))
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [showPath, pathSegments, helixCurve, scale, startOffset])

  useEffect(() => {
    return () => {
      try {
        geometry.dispose && geometry.dispose()
        material.dispose && material.dispose()
        if (colorMap && colorMap.dispose) colorMap.dispose()
      } catch (e) {}
    }
  }, []) // eslint-disable-line

  return (
    <group position={[0, 0, 0]} rotation={[...rotation]}>
      <instancedMesh ref={instRef} args={[geometry, material, Math.max(1, count)]} castShadow receiveShadow />
      {showPath && pathGeometry ? (
        <line position={[0,0,0]}>
          <primitive object={pathGeometry} attach="geometry" />
          <lineBasicMaterial attach="material" color={pathColor} linewidth={1} />
        </line>
      ) : null}
    </group>
  )
}

