import React from 'react';

export const metadata = {
  title: 'FabLab Board',
  description: 'FabLab Digital Signage',
};

export default function BoardLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>
      {children}
    </div>
  );
}
