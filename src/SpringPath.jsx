// src/SpringPath.jsx
import React, { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useLoader, useFrame, useThree } from '@react-three/fiber'

/* ---------------- HelixCurve (fallback & primary) ---------------- */
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

/* ---------------- SpringPath component ---------------- */
export default function SpringPath ({
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
  activeIndexRef = { current: 0 },
  activeRadius = 4,
  activeFade = 3,
  downAmplitude = 7.0,
  frontHold = 1,
  curvatureEnabled = true,
  floatEnabled = false,
  floatSpeed = 1.0,
  rotationIntensity = 0.6,
  riseSmoothing = 0.12,
  reverseStart = false
}) {
  const instRef = useRef()
  const { scene } = useThree()

  // load texture (non-fatal)
  let colorMap = null
  try {
    colorMap = useLoader(THREE.TextureLoader, texturePath)
    colorMap.encoding = THREE.sRGBEncoding
    colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping
    colorMap.repeat.set(1.2, 1.0)
  } catch (e) {
    colorMap = null
  }

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

  // helix curve (we only use helix here — user wanted Blender removal)
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
      let t = (tRaw + startOffset) % 1
      if (reverseStart) {
        t = 1 - t
        if (t < 0) t += 1
      }

      const localPoint = new THREE.Vector3()
      helixCurve.getPoint(t, localPoint)

      const worldPoint = localPoint.clone().multiplyScalar(scale)

      const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
      if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
      const outwardDist = (brick.depth / 2 + radialOffset) * scale
      const outward = radial.clone().multiplyScalar(outwardDist)

      tmpPos.set(worldPoint.x + outward.x + position[0], worldPoint.y + position[1], worldPoint.z + outward.z + position[2])

      // orientation: align to path tangent (approx using radial here for base orientation)
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
  }, [count, helixCurve, scale, position, startOffset, brick.depth, radialOffset, geometry, reverseStart])

  // Per-frame update for instances (follows helix)
  useFrame((state) => {
    const mesh = instRef.current
    if (!mesh || !mesh.__baseMats) return
    const base = mesh.__baseMats
    const path = helixCurve

    const tmpMat = new THREE.Matrix4()
    const tmpPos = new THREE.Vector3()
    const tmpQuat = new THREE.Quaternion()
    const tmpScale = new THREE.Vector3(1, 1, 1)

    const perFrameLerp = 1 - Math.exp(- (Math.max(0.01, riseSmoothing) * 60) * Math.min(0.06, state.clock.delta || (1/60)))

    for (let i = 0; i < Math.min(base.length, mesh.count); i++) {
      const tRaw = (i + 0.5) / count
      let t = (tRaw + startOffset) % 1
      if (reverseStart) {
        t = 1 - t
        if (t < 0) t += 1
      }

      const localPoint = new THREE.Vector3()
      path.getPoint(t, localPoint)
      const worldPoint = localPoint.clone().multiplyScalar(scale)

      const radial = new THREE.Vector3(localPoint.x, 0, localPoint.z).normalize()
      if (!isFinite(radial.x) || radial.lengthSq() < 1e-6) radial.set(1, 0, 0)
      const outward = radial.clone().multiplyScalar((brick.depth / 2 + radialOffset) * scale)

      tmpPos.set(worldPoint.x + outward.x + position[0], worldPoint.y + position[1], worldPoint.z + outward.z + position[2])

      // orientation: align to path tangent
      const tangent = new THREE.Vector3()
      {
        const eps = 1 / 1000
        const t0 = Math.max(0, t - eps), t1 = Math.min(1, t + eps)
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
        path.getPoint(t0, p0); path.getPoint(t1, p1)
        tangent.copy(p1).sub(p0).normalize()
      }

      // if reverseStart, flip tangent so bricks face correct direction
      if (reverseStart) tangent.negate()

      const zAxis = tangent.clone().normalize()
      if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1)
      const yAxis = new THREE.Vector3(0, 1, 0)
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize()
      const yOrtho = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize()
      const mat = new THREE.Matrix4().makeBasis(xAxis, yOrtho, zAxis)
      tmpQuat.setFromRotationMatrix(mat)

      tmpMat.compose(tmpPos, tmpQuat, tmpScale)
      mesh.setMatrixAt(i, tmpMat)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  // IMPORTANT: we only use helix; set a small global indicator for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window._springSelectedPath = 'helix'
      console.log('[Spring] selected pathType = "helix"')
    }
    return () => {
      if (typeof window !== 'undefined') {
        // cleanup flag when component unmounts
        if (window._springSelectedPath === 'helix') {
          delete window._springSelectedPath
          console.log('[Spring] springpath unmounted — cleared pathType')
        }
      }
    }
  }, [])

  // visual path geometry (helix)
  const pathGeometry = useMemo(() => {
    if (!showPath) return null
    const pts = []
    const v = new THREE.Vector3()
    const segs = Math.max(64, pathSegments)
    for (let i = 0; i <= segs; i++) {
      let t = i / segs
      if (reverseStart) {
        t = 1 - t
        if (t < 0) t += 1
      }
      helixCurve.getPoint(t, v)
      pts.push(v.clone().multiplyScalar(scale))
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [showPath, pathSegments, helixCurve, scale, reverseStart])

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
