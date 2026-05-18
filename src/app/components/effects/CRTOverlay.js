'use client';

export default function CRTOverlay({ scanlines = true, flicker = true, beam = true, vignette = true }) {
  return (
    <>
      {scanlines && <div className="crt-scanlines" />}
      {vignette && <div className="crt-vignette" />}
      {flicker && <div className="crt-flicker" />}
      {beam && <div className="crt-beam" />}
    </>
  );
}
