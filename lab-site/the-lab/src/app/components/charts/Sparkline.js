'use client';
import { useEffect, useRef } from 'react';

export default function Sparkline({ data, width = 120, height = 36, color = '#39ff14', fill = true, area = 'rgba(57,255,20,0.15)' }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = width * dpr; c.height = height * dpr;
    c.style.width = width + 'px'; c.style.height = height + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!data || data.length < 2) return;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * (width - 2) + 1,
      height - 2 - ((v - min) / range) * (height - 4),
    ]);
    if (fill) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], height);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(pts[pts.length - 1][0], height);
      ctx.closePath();
      ctx.fillStyle = area;
      ctx.fill();
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const [lx, ly] = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fill();
  }, [data, width, height, color, fill, area]);

  return <canvas ref={ref} />;
}
