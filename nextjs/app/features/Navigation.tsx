"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

export default function Navigation() {
  const { isAuthenticated, checkAuth } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
      await checkAuth();
      router.push("/");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="w-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border-b border-white/20">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-lg font-semibold">
            📅 Calendar Merge Service
          </h2>
          <div className="flex gap-4">
            {pathname !== "/dashboard" && (
              <Link
                href="/dashboard"
                className="text-sm text-white/90 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
            )}
            {pathname !== "/" && (
              <Link
                href="/"
                className="text-sm text-white/90 hover:text-white transition-colors"
              >
                Home
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-white/90 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
