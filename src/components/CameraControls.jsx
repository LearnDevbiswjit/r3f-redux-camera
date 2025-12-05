// src/components/CameraControls.jsx
import React, { useEffect } from 'react'
import { useControls } from 'leva'

export default function CameraControls() {
  const values = useControls({
    Helix: {
      turns: { value: 1, min: 1, max: 40, step: 1 },
      height: { value: 80, min: 0, max: 1000, step: 1 },
      radius: { value: 18, min: 0, max: 400, step: 0.1 },
      points: { value: 2000, min: 50, max: 8000, step: 1 },
      initialYawDeg: { value: 90, min: -180, max: 180, step: 1, label: 'initial yaw (deg)' },
      blendDuration: { value: 0.8, min: 0.01, max: 5, step: 0.01, label: 'yaw blend (s)' }
    },
    Bricks: {
      showBriks: { value: true },
      pathScale: { value: 5, min: 0.1, max: 40, step: 0.01 },
      brickSpacing: { value: 10, min: 1, max: 200, step: 1 },
      brickScale: { value: 1, min: 0.01, max: 5, step: 0.01 },
      brickPathColor: { value: '#ff3b30' }
    },
    Camera: {
      camOffsetX: { value: 0, min: -400, max: 400, step: 0.1 },
      camOffsetY: { value: 0, min: -400, max: 400, step: 0.1 },
      camOffsetZ: { value: 0, min: -400, max: 400, step: 0.1 },
      camRotDegX: { value: 0, min: -90, max: 90, step: 0.1, label: 'pitch (deg)' },
      camRotDegY: { value: 0, min: -180, max: 180, step: 0.1, label: 'yaw offset (deg)' },
      camRotDegZ: { value: 0, min: -180, max: 180, step: 0.1, label: 'roll (deg)' },
      tightFollow: { value: true },
      damping: { value: 6, min: 0.01, max: 50, step: 0.01 }
    }
  })

  // sync to a global so CameraRig (inside Canvas) can read
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__LEVA_CAMERA_STATE__ = window.__LEVA_CAMERA_STATE__ || {}
    // shallow copy so ref equality changes on update
    window.__LEVA_CAMERA_STATE__ = Object.assign({}, window.__LEVA_CAMERA_STATE__, values)
    // expose for debug
    window.__LEVA_CAMERA_STATE__._updatedAt = Date.now()
  }, [values])

  return null
}
