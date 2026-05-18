"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoadingTerminal from "@/app/components/LoadingTerminal";

export default function OnboardingRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.userID) {
      router.replace(`/dashboard/${session.user.userID}/onboarding`);
    } else if (status === "unauthenticated") {
      router.replace("/auth/signin");
    }
  }, [status, session, router]);

  return <LoadingTerminal />;
}
