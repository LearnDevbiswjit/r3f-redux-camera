// src/theatre/autoRegisterSheet.js
// Robust registration of theatreA/theatreB subranges from one sheet.sequence.
// If the underlying sheet sequence is shorter than expected, the wrapper will
// clamp to available range and optionally hold last frame (safe fallback).

export function registerSheetTimelines(registry, sheet, durations = { theatreA: 20 * 60, helix: 20 * 60, theatreB: 30 * 60 }) {
  if (!registry) {
    console.warn('[registerSheetTimelines] no registry provided');
    return;
  }
  if (!sheet) {
    console.warn('[registerSheetTimelines] no sheet provided');
    return;
  }

  try {
    const seq = sheet.sequence;
    if (!seq) {
      console.warn('[registerSheetTimelines] sheet.sequence not found on sheet:', sheet);
      return;
    }

    // try to detect the real total seconds of the exported sheet.sequence
    const detectSequenceLengthSeconds = () => {
      try {
        const ptrLen = seq?.pointer?.length;
        if (ptrLen && Number.isFinite(ptrLen)) return Number(ptrLen);
        if (seq?.length && Number.isFinite(Number(seq.length))) return Number(seq.length);
      } catch (e) {}
      // fallback: sum durations
      return (durations.theatreA || 20 * 60) + (durations.helix || 20 * 60) + (durations.theatreB || 30 * 60);
    };

    const seqTotalSec = detectSequenceLengthSeconds();

    const dA = durations.theatreA || 20 * 60;
    const dH = durations.helix || 20 * 60;
    const dB = durations.theatreB || 30 * 60;
    const totalDur = dA + dH + dB;

    const scale = seqTotalSec > 0 ? (seqTotalSec / totalDur) : 1.0;

    const segA = { start: 0, length: dA * scale };
    const segH = { start: segA.start + segA.length, length: dH * scale };
    const segB = { start: segH.start + segH.length, length: dB * scale };

    // utility to set sequence position in a robust manner
    const setSeqPos = (absSec) => {
      const safe = Math.max(0, Math.min(seqTotalSec, absSec));
      try {
        if (typeof seq.position !== 'undefined') {
          seq.position = safe;
          return;
        }
        if (typeof seq.setPosition === 'function') {
          seq.setPosition(safe);
          return;
        }
        if (typeof seq.seek === 'function') {
          seq.seek(safe);
          return;
        }
        if (seq.pointer && typeof seq.pointer.position !== 'undefined') {
          seq.pointer.position = safe;
          return;
        }
      } catch (e) {
        console.warn('[registerSheetTimelines] setSeqPos failed:', e);
      }
    };

    // sample last frame helper (for hold behaviour)
    let lastFramePos = Math.max(0, Math.min(seqTotalSec, segB.start + segB.length));
    // if seqTotalSec is smaller than segB end, lastFramePos will be seqTotalSec

    // wrapper factory for a subrange
    function makeWrapperForRange(startSec, lengthSec, name = 'range') {
      return {
        play() { try { if (typeof seq.play === 'function') seq.play(); } catch (e) {} },
        pause() { try { if (typeof seq.pause === 'function') seq.pause(); } catch (e) {} },
        seek(tSec) {
          // tSec in [0 .. lengthSec]
          const clamped = Math.max(0, Math.min(lengthSec, tSec));
          const target = startSec + clamped;
          if (target <= seqTotalSec) {
            // within available sheet: just set sequence position
            setSeqPos(target);
          } else {
            // target beyond exported sheet: clamp to end (hold last frame)
            setSeqPos(seqTotalSec);
            // optionally: if a registry has a simulated fallback registered (e.g. 'simulatedTheatreB'),
            // you could call it here to animate past sheet end. We keep simple and hold.
          }
        },
        seekNormalized(n) {
          const clamped = Math.max(0, Math.min(1, n));
          const tSec = lengthSec * clamped;
          this.seek(tSec);
        },
        durationSeconds: lengthSec
      };
    }

    // Register theatreA normally (it usually exists in exported sheet).
    registry.registerTimeline('theatreA', makeWrapperForRange(segA.start, segA.length, 'theatreA'));

    // Register theatreB: IMPORTANT — if segB extends beyond seqTotalSec, wrapper will clamp/hold.
    registry.registerTimeline('theatreB', makeWrapperForRange(segB.start, segB.length, 'theatreB'));

    console.info('[registerSheetTimelines] registered theatreA/theatreB -> segs:', { seqTotalSec, segA, segH, segB, scale });

  } catch (err) {
    console.error('[registerSheetTimelines] failed to register sheet timelines:', err);
  }
}
