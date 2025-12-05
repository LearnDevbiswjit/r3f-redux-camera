// src/Briks.jsx
import React, { useMemo } from 'react'
import * as THREE from 'three'

export default function Briks({
  points = [],
  pathScale = 5,
  brickSpacing = 10,
  brickScale = 1,
  pathColor = '#ff3b30',
  texture = '/textures/brick-texture.jpg'
} = {}) {
  // load texture once
  const colorMap = useMemo(() => {
    const t = new THREE.TextureLoader().load(texture)
    t.encoding = THREE.sRGBEncoding
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 1)
    return t
  }, [texture])

  // shared geometry & material for bricks (good for performance)
  const geometry = useMemo(() => new THREE.BoxGeometry(15.747, 2.552, 7.888, 2, 2, 2), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: colorMap,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.FrontSide
  }), [colorMap])

  // scaled path points
  const scaled = useMemo(() => (points || []).map(p => p.clone().multiplyScalar(pathScale)), [points, pathScale])

  // compute bricks transforms along scaled path
  const bricks = useMemo(() => {
    if (!scaled.length) return []
    const arr = []
    const step = Math.max(1, Math.floor(brickSpacing))
    for (let i = 0; i < scaled.length; i += step) {
      const pos = scaled[i]
      const next = scaled[Math.min(i + 1, scaled.length - 1)] || pos.clone().add(new THREE.Vector3(0, 0, -1))
      let dir = next.clone().sub(pos)
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1)
      dir.normalize()

      // We want brick's +Z to align with path dir (forward)
      // and brick's X to align with world X projected onto the plane of the brick
      const worldUp = new THREE.Vector3(0, 1, 0)
      let side = new THREE.Vector3().crossVectors(worldUp, dir).normalize()
      if (!isFinite(side.x) || side.lengthSq() < 1e-6) side.set(1, 0, 0)
      const yOrtho = new THREE.Vector3().crossVectors(dir, side).normalize()
      // build basis where X=side, Y=yOrtho, Z=dir
      const mat = new THREE.Matrix4().makeBasis(side, yOrtho, dir)
      const quat = new THREE.Quaternion().setFromRotationMatrix(mat)

      arr.push({ pos, quat })
    }
    return arr
  }, [scaled, brickSpacing])

  // debug path line
  const lineGeom = useMemo(() => {
    if (!scaled.length) return null
    return new THREE.BufferGeometry().setFromPoints(scaled)
  }, [scaled])

  return (
    <group>
      {lineGeom && (
        <line geometry={lineGeom}>
          <lineBasicMaterial color={pathColor} />
        </line>
      )}

      {bricks.map((b, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={b.pos}
          quaternion={b.quat}
          scale={[brickScale, brickScale, brickScale]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
