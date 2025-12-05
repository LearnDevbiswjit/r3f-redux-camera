// src/App.jsx
import React, { useRef, useEffect } from 'react'
import ScrollSection from './ScrollSection'
import GsapOverlay from './component/GsapOverlay'
import SimpleLoader from './SimpleLoader'


let LocomotiveScroll = null
try {
  // dynamic require so bundlers don't break if package missing
  // install with: npm i locomotive-scroll
  // some bundlers may need import; dynamic require works in many setups
  // eslint-disable-next-line global-require
  LocomotiveScroll = require('locomotive-scroll').default
} catch (e) {
  LocomotiveScroll = null
}

export default function App () {
  const COUNT = 4
  const triggersRef = useRef(Array.from({ length: COUNT }).map(() => React.createRef()))
  const locoRef = useRef(null)
  const rafPubRef = useRef(null)
  const nativeCleanupRef = useRef(null)

  useEffect(() => {
    // safety: avoid SSR noise
    if (typeof window === 'undefined') return

    // ensure consistent globals (consumers expect these)
    window._springScrollOffset = typeof window._springScrollOffset === 'number' ? window._springScrollOffset : 0
    window._springScrollY = typeof window._springScrollY === 'number' ? window._springScrollY : 0
    window._springScrollVelocity = typeof window._springScrollVelocity === 'number' ? window._springScrollVelocity : 0
    window._springScrollVelocitySmoothed = typeof window._springScrollVelocitySmoothed === 'number' ? window._springScrollVelocitySmoothed : 0

    // small local publisher state
    let smoothVal = window._springScrollVelocitySmoothed || 0
    const ALPHA = 0.12 // smoothing (tune 0.02..0.18: smaller => smoother)
    const MAX_VEL = 6.0

    function publishSigned (signed) {
      const clamped = Math.max(-MAX_VEL, Math.min(MAX_VEL, signed || 0))
      window._springScrollVelocity = clamped
      const mag = Math.abs(clamped)
      smoothVal = smoothVal * (1 - ALPHA) + mag * ALPHA
      window._springScrollVelocitySmoothed = smoothVal
    }

    // COMMON RAF publisher to keep smoothed value decaying/publishing steadily
    function startPublisherRAF () {
      if (rafPubRef.current) return
      function loop () {
        try {
          // re-publish last known to let consumers decay/smooth
          publishSigned(window._springScrollVelocity || 0)
        } catch (e) {}
        rafPubRef.current = requestAnimationFrame(loop)
      }
      rafPubRef.current = requestAnimationFrame(loop)
    }

    // CLEANUP helper
    function stopPublisherRAF () {
      if (rafPubRef.current) cancelAnimationFrame(rafPubRef.current)
      rafPubRef.current = null
    }

    // 1) If locomotive available, init and hook events
    if (LocomotiveScroll) {
      try {
        const container = document.querySelector('[data-scroll-container]') || document.body
        const loco = new LocomotiveScroll({
          el: container,
          smooth: true,
          lerp: 0.08, // tune: smaller = tighter mapping, larger = smoother but more lag
          smartphone: { smooth: true },
          tablet: { smooth: true }
        })
        locoRef.current = loco

        // locomotive fires 'scroll' events; we try to read best available velocity
        loco.on('scroll', (obj) => {
          try {
            // some versions expose obj.velocity (signed), some expose delta
            let sample = 0
            if (obj && typeof obj.velocity === 'number') sample = obj.velocity
            else if (obj && typeof obj.deltaY === 'number') sample = obj.deltaY
            else if (loco && loco.scroll && loco.scroll.instance && typeof loco.scroll.instance.delta === 'number') sample = loco.scroll.instance.delta
            publishSigned(sample)
          } catch (e) {}
        })

        // also start a gentle RAF publisher to provide consistent normalized offset & y
        startPublisherRAF()
        // compute offset periodically (some loco versions expose limit/scroll)
        function refreshOffset () {
          try {
            const inst = loco && loco.scroll && loco.scroll.instance ? loco.scroll.instance : null
            const scrollY = (typeof inst?.scroll === 'number') ? inst.scroll : (typeof loco.scroll === 'number' ? loco.scroll : window.scrollY || 0)
            // determine limit/height
            const limit = typeof loco.limit === 'function' ? Math.max(1, loco.limit()) : Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
            const offset = limit > 0 ? Math.max(0, Math.min(1, scrollY / limit)) : 0
            window._springScrollOffset = offset
            window._springScrollY = scrollY
          } catch (e) {}
          // keep updating occasionally
          requestAnimationFrame(refreshOffset)
        }
        requestAnimationFrame(refreshOffset)
      } catch (e) {
        // if locomotive init fails, fall back to native below
        // eslint-disable-next-line no-console
        console.warn('[App] locomotive init failed, falling back to native scroller', e)
        initNativeScroller()
      }
    } else {
      // Locomotive not present — use native wheel/scroll handlers
      initNativeScroller()
    }

    // native fallback implementation
    function initNativeScroller () {
      if (nativeCleanupRef.current) return
      let lastY = window.scrollY || document.documentElement.scrollTop || 0
      let lastT = performance.now()
      startPublisherRAF()

      function onWheel (ev) {
        // wheel deltaY is signed; scale down to reasonable range
        const signed = ev.deltaY || (ev.wheelDelta ? -ev.wheelDelta : 0)
        publishSigned(signed * 0.02) // tweak scale if needed
      }
      function onScroll () {
        const now = performance.now()
        const y = window.scrollY || document.documentElement.scrollTop || 0
        const dt = Math.max(1, now - lastT)
        const dy = y - lastY
        lastY = y
        lastT = now
        // normalized-ish per-frame velocity approximation
        const v = dy / dt * 16
        publishSigned(v)
        // also update offset/y
        const limit = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        window._springScrollOffset = limit > 0 ? Math.max(0, Math.min(1, y / limit)) : 0
        window._springScrollY = y
      }

      function onTouchStart (e) {
        // nothing special; handled in touchmove
      }
      let lastTouchY = null
      function onTouchMove (e) {
        const ty = e.touches && e.touches[0] ? e.touches[0].clientY : null
        if (ty == null) return
        if (lastTouchY == null) lastTouchY = ty
        const dy = lastTouchY - ty
        lastTouchY = ty
        publishSigned(dy * 0.6)
      }

      window.addEventListener('wheel', onWheel, { passive: true })
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('touchstart', onTouchStart, { passive: true })
      window.addEventListener('touchmove', onTouchMove, { passive: true })

      nativeCleanupRef.current = () => {
        window.removeEventListener('wheel', onWheel)
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('touchstart', onTouchStart)
        window.removeEventListener('touchmove', onTouchMove)
        stopPublisherRAF()
        nativeCleanupRef.current = null
      }
    }
 
    // cleanup on unmount
    return () => {
      try {
        if (locoRef.current && typeof locoRef.current.destroy === 'function') locoRef.current.destroy()
      } catch (e) {}
      if (nativeCleanupRef.current) nativeCleanupRef.current()
      if (rafPubRef.current) cancelAnimationFrame(rafPubRef.current)
      // optionally keep globals but you can clear if you prefer:
      // delete window._springScrollVelocity; delete window._springScrollVelocitySmoothed;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <SimpleLoader autoProceedMs={1000} />
      {/* mark container for locomotive if used */}
      <div id='app-root' data-scroll-container style={{ minHeight: '100vh' }}>
        <ScrollSection triggersRef={triggersRef} />
        <GsapOverlay triggersRef={triggersRef} />
      </div>
    </>
  )
}
