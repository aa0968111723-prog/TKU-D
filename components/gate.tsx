"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function Gate({ onboarded, children }: { onboarded: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!onboarded && path !== "/onboarding") router.replace("/onboarding");
  }, [onboarded, path, router]);
  return children;
}
