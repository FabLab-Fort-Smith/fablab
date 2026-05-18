"use client";
import React from 'react';
import { SessionProvider } from "next-auth/react";

export default function Providers({ session, children }) {
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  );
}
