// src/components/CameraSwitcher.jsx
import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { PerspectiveCamera as TheatrePerspective } from '@theatre/r3f';
import { PerspectiveCamera as DreiPerspective } from '@react-three/drei';
import * as THREE from 'three';

/*
  CameraSwitcher:
  - Single camera policy: only one makeDefault camera mounted at a time.
  - When redux camera.mode === 'theatre' AND a Theatre sheet exists -> mount @theatre/r3f camera
  - Otherwise mount plain drei PerspectiveCamera controlled by CameraRig.
  - Preserve transform on swap to avoid jump.
*/

export default function CameraSwitcher({ theatreKey = 'Camera', fov = 40, near = 0.1, far = 6000 }) {
  const mode = useSelector(s => s.camera.mode); // 'theatre' | 'helix'
  const three = useThree();
  const lastTransformRef = useRef({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion()
  });

  // snapshot active camera transform each frame
  useEffect(() => {
    let raf = null;
    function tick() {
      const cam = three.camera;
      if (cam) {
        lastTransformRef.current.pos.copy(cam.position);
        lastTransformRef.current.quat.copy(cam.quaternion);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [three]);

  const theatreRef = useRef(null);
  const freeRef = useRef(null);

  const studioPresent = typeof window !== 'undefined' && !!window.__THEATRE_SHEET__;
  const shouldUseTheatre = (mode === 'theatre') && studioPresent;

  // expose global flag for wrappers (so they can avoid overriding camera while Studio controls it)
  useEffect(() => {
    if (typeof window !== 'undefined') window.__THEATRE_CONTROL_ACTIVE = !!shouldUseTheatre;
  }, [shouldUseTheatre]);

  // copy transform into newly mounted camera to avoid jump
  useEffect(() => {
    requestAnimationFrame(() => {
      const { pos, quat } = lastTransformRef.current;
      if (shouldUseTheatre) {
        const r = theatreRef.current;
        const obj = (r && (r.object || r.current)) || null;
        if (obj) {
          obj.position.copy(pos);
          obj.quaternion.copy(quat);
          obj.updateMatrixWorld();
        }
      } else {
        const r = freeRef.current;
        const obj = (r && (r.current || r)) || null;
        if (obj) {
          obj.position.copy(pos);
          obj.quaternion.copy(quat);
          obj.updateMatrixWorld();
        }
      }
    });
  }, [shouldUseTheatre]);

  if (shouldUseTheatre) {
    return <TheatrePerspective ref={theatreRef} theatreKey={theatreKey} makeDefault fov={fov} near={near} far={far} />;
  }

  return <DreiPerspective ref={freeRef} makeDefault fov={fov} near={near} far={far} />;
}
