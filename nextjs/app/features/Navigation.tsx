"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function Navigation() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.isLoggedIn);
      }
    } catch (err) {
      console.error("Auth check failed:", err);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
      setIsAuthenticated(false);
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
              <a
                href="/dashboard"
                className="text-sm text-white/90 hover:text-white transition-colors"
              >
                Dashboard
              </a>
            )}
            {pathname !== "/" && (
              <a
                href="/"
                className="text-sm text-white/90 hover:text-white transition-colors"
              >
                Home
              </a>
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
