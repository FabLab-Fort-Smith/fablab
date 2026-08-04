"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import LoadingTerminal from '@/app/components/LoadingTerminal';
import { dashboardHomePath, SIGN_IN_PATH } from '@/lib/dashboardPath';

const DashboardPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const loading = status === 'loading';
  const [noAccountId, setNoAccountId] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      router.push(SIGN_IN_PATH);
      return;
    }

    const home = dashboardHomePath(session);
    if (home) {
      router.push(home);
      return;
    }

    // Signed in but the session carries no userID. Do NOT redirect to sign-in: the
    // middleware bounces authenticated /auth/* back to /dashboard, so that would loop.
    // Show a recoverable message instead (issue #186).
    setNoAccountId(true);
  }, [session, loading, router]);

  if (loading) {
    return <LoadingTerminal />;
  }

  if (noAccountId) {
    return (
      <div style={{ padding: '24px', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-bright)' }}>
        <h1 style={{ fontSize: 15, color: 'var(--amber)', margin: '0 0 8px' }}>
          Your session is missing an account id
        </h1>
        <p style={{ color: 'var(--text-mid)', margin: '0 0 12px' }}>
          We could not work out which dashboard to open. Signing out and back in usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: SIGN_IN_PATH })}
          style={{
            padding: '5px 10px', border: '1px solid var(--green)', color: 'var(--green)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
          }}
        >
          sign out
        </button>
      </div>
    );
  }

  return null;
};

export default DashboardPage;
