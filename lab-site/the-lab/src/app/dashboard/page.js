"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const DashboardPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const loading = status === 'loading';

  useEffect(() => {
    if (!loading) {
      if (session) {
        router.push(`/dashboard/${session.user.id}`);
      } else {
        router.push('/login');
      }
    }
  }, [session, loading, router]);

  if (loading) {
    return <LoadingTerminal />;
  }

  return null;
};

export default DashboardPage;
