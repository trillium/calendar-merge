"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Watch {
  calendarId: string;
  expiration: number;
  paused: boolean;
  targetCalendarId: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthAndLoadStatus();
  }, []);

  async function checkAuthAndLoadStatus() {
    try {
      const sessionRes = await fetch("/api/session");
      if (!sessionRes.ok) {
        router.push("/");
        return;
      }

      const statusRes = await fetch("/api/sync/status");
      if (statusRes.ok) {
        const data = await statusRes.json();
        setWatches(data.watches || []);
      }
    } catch (err) {
      setError("Failed to load sync status");
    } finally {
      setLoading(false);
    }
  }

  async function handleStopSync() {
    if (!confirm("Are you sure you want to stop syncing? This will remove all calendar watches.")) {
      return;
    }

    try {
      const res = await fetch("/api/sync/stop", { method: "POST" });
      if (res.ok) {
        alert("Sync stopped successfully");
        router.push("/");
      } else {
        alert("Failed to stop sync");
      }
    } catch (err) {
      alert("Error stopping sync");
    }
  }

  async function handlePauseSync() {
    try {
      const res = await fetch("/api/sync/pause", { method: "POST" });
      if (res.ok) {
        alert("Sync paused successfully");
        await checkAuthAndLoadStatus();
      }
    } catch (err) {
      alert("Error pausing sync");
    }
  }

  async function handleResumeSync() {
    try {
      const res = await fetch("/api/sync/resume", { method: "POST" });
      if (res.ok) {
        alert("Sync resumed successfully");
        await checkAuthAndLoadStatus();
      }
    } catch (err) {
      alert("Error resuming sync");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600 dark:text-gray-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full p-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-gray-800 dark:text-gray-100 text-3xl font-bold">
            📊 Sync Dashboard
          </h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            Home
          </button>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {watches.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No active calendar syncs found.
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg"
            >
              Set Up Sync
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Active Calendar Watches ({watches.length})
              </h2>
              <div className="space-y-3">
                {watches.map((watch, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                          Source Calendar
                        </p>
                        <p className="font-medium text-gray-800 dark:text-gray-200 break-all">
                          {watch.calendarId}
                        </p>
                      </div>
                      <span
                        className={`ml-3 px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                          watch.paused
                            ? "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200"
                        }`}
                      >
                        {watch.paused ? "Paused" : "Active"}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Target: </span>
                        <span className="text-gray-700 dark:text-gray-300 break-all">
                          {watch.targetCalendarId}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Expires: </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {new Date(watch.expiration).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {watches.some((w) => !w.paused) ? (
                <button
                  onClick={handlePauseSync}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-6 rounded-lg"
                >
                  Pause Sync
                </button>
              ) : (
                <button
                  onClick={handleResumeSync}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg"
                >
                  Resume Sync
                </button>
              )}
              <button
                onClick={handleStopSync}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg"
              >
                Stop & Unsubscribe
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
