'use client';
import { useEffect, useState } from 'react';

const LoadingTerminal = ({ steps = ['Loading...'] }) => {
  const [lines, setLines] = useState([]);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length < 3 ? d + '.' : ''), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (i < steps.length) { setLines(l => [...l, steps[i]]); i++; }
      else clearInterval(id);
    }, 800);
    return () => clearInterval(id);
  }, [steps]);

  return (
    <div style={{
      background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--mono)',
      padding: '2rem', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ fontSize: 13, marginBottom: 4, color: line.includes('successfully') || line.includes('Stake') ? 'var(--green)' : 'var(--text-mid)' }}>
          <span style={{ color: 'var(--green)' }}>&gt;</span> {line}
        </div>
      ))}
      <div style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--green)' }}>&gt;</span>
        <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
        processing{dots}
      </div>
    </div>
  );
};

export default LoadingTerminal;
