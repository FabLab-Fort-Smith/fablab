'use client';

export default function GlitchText({ children, as: As = 'span', style, className = '', ...rest }) {
  return (
    <As data-text={children} className={`glitch ${className}`} style={style} {...rest}>
      {children}
    </As>
  );
}
