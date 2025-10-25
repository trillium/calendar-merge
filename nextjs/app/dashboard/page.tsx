"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Watch {
  calendarId: string;
  calendarName: string;
  expiration: number;
  paused: boolean;
  targetCalendarId: string;
  targetCalendarName: string;
  stats: {
    totalEventsSynced: number;
    lastSyncTime: number | null;
    lastSyncEventCount: number | null;
  };
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

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

  async function confirmStopSync() {
    try {
      const res = await fetch("/api/sync/stop", { method: "POST" });
      if (res.ok) {
        setMessage({ text: "Sync stopped successfully. Redirecting...", type: "success" });
        setTimeout(() => router.push("/"), 2000);
      } else {
        setMessage({ text: "Failed to stop sync", type: "error" });
      }
    } catch (err) {
      setMessage({ text: "Error stopping sync", type: "error" });
    } finally {
      setShowStopConfirm(false);
    }
  }

  async function handlePauseSync() {
    try {
      const res = await fetch("/api/sync/pause", { method: "POST" });
      if (res.ok) {
        setMessage({ text: "Sync paused successfully", type: "success" });
        await checkAuthAndLoadStatus();
      } else {
        setMessage({ text: "Failed to pause sync", type: "error" });
      }
    } catch (err) {
      setMessage({ text: "Error pausing sync", type: "error" });
    }
  }

  async function handleResumeSync() {
    try {
      const res = await fetch("/api/sync/resume", { method: "POST" });
      if (res.ok) {
        setMessage({ text: "Sync resumed successfully", type: "success" });
        await checkAuthAndLoadStatus();
      } else {
        setMessage({ text: "Failed to resume sync", type: "error" });
      }
    } catch (err) {
      setMessage({ text: "Error resuming sync", type: "error" });
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full p-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-gray-800 dark:text-gray-100 text-3xl font-bold">
            📊 Sync Dashboard
          </h1>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Home
          </button>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {message && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              message.type === "success"
                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {showStopConfirm && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600 p-6 rounded-lg mb-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Stop Syncing?
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              This will remove all calendar watches and stop syncing events. You'll need to set up sync again if you want to resume.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmStopSync}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Yes, Stop Sync
              </button>
              <button
                onClick={() => setShowStopConfirm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg"
              >
                Cancel
              </button>
            </div>
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
                        <p className="font-medium text-gray-800 dark:text-gray-200">
                          {watch.calendarName}
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
                        <span className="text-gray-500 dark:text-gray-400">Syncing to: </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {watch.targetCalendarName}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                              Total Synced
                            </p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {watch.stats?.totalEventsSynced || 0} events
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                              Last Sync
                            </p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {watch.stats?.lastSyncTime
                                ? new Date(watch.stats.lastSyncTime).toLocaleString()
                                : "Never"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          Watch expires: {new Date(watch.expiration).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {watches.some((w) => !w.paused) ? (
                <button
                  onClick={handlePauseSync}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-6 rounded-lg whitespace-nowrap"
                >
                  Pause Sync
                </button>
              ) : (
                <button
                  onClick={handleResumeSync}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg whitespace-nowrap"
                >
                  Resume Sync
                </button>
              )}
              <button
                onClick={() => setShowStopConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg whitespace-nowrap"
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
