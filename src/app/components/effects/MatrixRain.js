'use client';
import { useEffect, useRef } from 'react';

export default function MatrixRain({ density = 1, color = '#39ff14', fade = 0.06, speed = 1, charSet, style }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const colsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chars = (charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]<>/\\|=+*-_:;.,?!@#$%^&アイウエオカキクケコサシスセソタチツテト').split('');
    let w = 0, h = 0, fontSize = 14, columns = 0;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width; h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
      fontSize = 14;
      columns = Math.max(1, Math.floor(w / fontSize / Math.max(0.3, density)));
      colsRef.current = Array.from({ length: columns }, () => ({
        y: Math.random() * h,
        speed: (1 + Math.random() * 2) * speed,
        head: Math.random() > 0.92,
      }));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    function draw() {
      ctx.fillStyle = `rgba(5,8,5,${fade})`;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textBaseline = 'top';
      const colW = w / columns;
      for (let i = 0; i < columns; i++) {
        const c = colsRef.current[i];
        const ch = chars[(Math.random() * chars.length) | 0];
        const x = i * colW;
        ctx.fillStyle = c.head ? '#d6ffe0' : color;
        ctx.shadowColor = color;
        ctx.shadowBlur = c.head ? 12 : 4;
        ctx.fillText(ch, x, c.y);
        ctx.shadowBlur = 0;
        c.y += c.speed * fontSize * 0.6;
        if (c.y > h && Math.random() > 0.975) {
          c.y = -fontSize * (Math.random() * 20);
          c.speed = (0.6 + Math.random() * 1.6) * speed;
          c.head = Math.random() > 0.85;
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [density, color, fade, speed, charSet]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, opacity: 0.7, ...style }}
    />
  );
}
