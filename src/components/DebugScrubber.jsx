// src/components/DebugScrubber.jsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setOverallProgress } from '../store/slices/timelineSlice';

export default function DebugScrubber() {
  const overall = useSelector(s => s.timeline.overallProgress);
  const phase = useSelector(s => s.timeline.phase);
  const durations = useSelector(s => s.timeline.durations);
  const dispatch = useDispatch();

  const onChange = (e) => {
    const v = parseFloat(e.target.value);
    dispatch(setOverallProgress(v));
  };

  return (
    <div style={{
      position:'fixed', right:20, top:20, zIndex:9999, background:'rgba(0,0,0,0.6)',
      color:'#fff', padding:10, borderRadius:8, fontFamily:'sans-serif'
    }}>
      <div style={{fontSize:12}}>Phase: {phase} | overall: {(overall*100).toFixed(2)}%</div>
      <input type="range" min={0} max={1} step={0.0001} value={overall} onChange={onChange} style={{width:240}} />
      <div style={{fontSize:11, marginTop:6}}>Durations (s): A {durations.theatreA}, H {durations.helix}, B {durations.theatreB}</div>
    </div>
  );
}
