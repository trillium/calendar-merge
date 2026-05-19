"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backend } from "../lib/backend";
import type { Watch, SyncProgress } from "../lib/backend";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; summary: string } | null>(null);
  const [dangerLoading, setDangerLoading] = useState(false);

  useEffect(() => {
    checkAuthAndLoadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for sync progress
  useEffect(() => {
    if (!syncProgress) return;

    // Stop polling if sync is complete or failed
    if (syncProgress.overallStatus === 'complete' || syncProgress.overallStatus === 'failed') {
      return;
    }

    // Poll every 10 seconds while syncing
    const interval = setInterval(() => {
      checkAuthAndLoadStatus();
    }, 10000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncProgress]);

  async function checkAuthAndLoadStatus() {
    try {
      const userId = localStorage.getItem("calendar_merge_userId");
      if (!userId) {
        router.push("/");
        return;
      }

      const statusRes = await fetch(`/api/sync/status?userId=${encodeURIComponent(userId)}`);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setWatches(data.watches || []);
        setSyncProgress(data.syncProgress || null);
      }
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      setMessage({ text: "Error resuming sync", type: "error" });
    }
  }

  async function loadCalendarsForDanger() {
    const userId = localStorage.getItem("calendar_merge_userId");
    if (!userId) return;
    try {
      const data = await backend.listCalendars(userId);
      setCalendars(data.calendars || []);
    } catch {
      setMessage({ text: "Failed to load calendars", type: "error" });
    }
  }

  async function handleDeleteCalendar() {
    if (!deleteTarget) return;
    const userId = localStorage.getItem("calendar_merge_userId");
    if (!userId) return;
    setDangerLoading(true);
    try {
      await backend.deleteCalendar(userId, deleteTarget.id);
      setMessage({ text: `Deleted "${deleteTarget.summary}" from Google`, type: "success" });
      setDeleteTarget(null);
      setCalendars(prev => prev.filter(c => c.id !== deleteTarget.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete calendar";
      setMessage({ text: msg, type: "error" });
    } finally {
      setDangerLoading(false);
    }
  }

  async function handleFullReset() {
    const userId = localStorage.getItem("calendar_merge_userId");
    if (!userId) return;
    setDangerLoading(true);
    try {
      await backend.clearSyncData(userId);
      localStorage.removeItem("calendar_merge_userId");
      setMessage({ text: "All data cleared. Redirecting to setup...", type: "success" });
      setTimeout(() => router.push("/"), 1500);
    } catch {
      setMessage({ text: "Error clearing data", type: "error" });
    } finally {
      setDangerLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full p-10">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600 dark:text-gray-300 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full p-10">
        <h1 className="text-gray-800 dark:text-gray-100 text-3xl font-bold mb-8">
          📊 Sync Dashboard
        </h1>

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
              This will remove all calendar watches and stop syncing events. You&apos;ll need to set up sync again if you want to resume.
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

        {/* Sync Progress Indicator */}
        {syncProgress && syncProgress.overallStatus !== 'complete' && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600 p-6 rounded-lg mb-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              {syncProgress.overallStatus === 'pending' && '⏳ Setting up sync...'}
              {syncProgress.overallStatus === 'syncing' && '🔄 Syncing events...'}
              {syncProgress.overallStatus === 'failed' && '❌ Sync failed'}
            </h3>
            {syncProgress.overallStatus === 'syncing' && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Progress</span>
                  <span>
                    {syncProgress.syncedEvents}
                    {syncProgress.totalEvents > 0 ? ` / ${syncProgress.totalEvents}` : ''} events
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-3 transition-all duration-300"
                    style={{
                      width: syncProgress.totalEvents > 0
                        ? `${Math.min((syncProgress.syncedEvents / syncProgress.totalEvents) * 100, 100)}%`
                        : '50%'
                    }}
                  />
                </div>
              </div>
            )}
            {syncProgress.overallStatus === 'pending' && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Please wait while we set up your calendar sync...
              </p>
            )}
            {syncProgress.overallStatus === 'failed' && (
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Sync failed. Please try again or contact support.
              </p>
            )}
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
                {watches.map((watch) => (
                  <div
                    key={watch.channelId}
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
                              Sync Token
                            </p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {watch.syncTokenUpdatedAt
                                ? new Date(watch.syncTokenUpdatedAt).toLocaleString()
                                : "Not synced"}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                              Events Synced
                            </p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {watch.stats?.totalEventsSynced || 0}
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

        {/* Danger Zone */}
        <div className="mt-12 border-2 border-red-300 dark:border-red-800 rounded-xl overflow-hidden">
          <button
            onClick={() => {
              setShowDangerZone(!showDangerZone);
              if (!showDangerZone) loadCalendarsForDanger();
            }}
            className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
          >
            <span className="text-red-700 dark:text-red-300 font-bold text-lg">
              ⚠️ DANGER ZONE — Dev Reset Tools
            </span>
            <span className="text-red-500 text-xl">{showDangerZone ? "▲" : "▼"}</span>
          </button>

          {showDangerZone && (
            <div className="p-6 bg-red-50/50 dark:bg-red-950/30 space-y-6">
              {/* Delete a Google Calendar */}
              <div>
                <h3 className="text-red-700 dark:text-red-300 font-semibold mb-2">
                  Delete a Google Calendar
                </h3>
                <p className="text-red-600/70 dark:text-red-400/70 text-sm mb-3">
                  Permanently deletes the calendar from your Google account. Cannot delete primary calendar.
                </p>
                {deleteTarget ? (
                  <div className="bg-red-100 dark:bg-red-900 border-2 border-red-400 dark:border-red-600 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200 font-semibold mb-3">
                      Permanently delete &quot;{deleteTarget.summary}&quot;?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleDeleteCalendar}
                        disabled={dangerLoading}
                        className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg"
                      >
                        {dangerLoading ? "Deleting..." : "YES, DELETE IT"}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(null)}
                        className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {calendars.filter(c => !c.primary).map(cal => (
                      <button
                        key={cal.id}
                        onClick={() => setDeleteTarget(cal)}
                        className="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 border-2 border-red-200 dark:border-red-800 rounded-lg hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                      >
                        <span className="text-gray-800 dark:text-gray-200">{cal.summary}</span>
                        <span className="text-red-400 dark:text-red-500 text-sm ml-2">× delete</span>
                      </button>
                    ))}
                    {calendars.filter(c => !c.primary).length === 0 && (
                      <p className="text-gray-500 text-sm italic">No deletable calendars (primary cannot be deleted)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Full Reset */}
              <div className="border-t-2 border-red-200 dark:border-red-800 pt-6">
                <h3 className="text-red-700 dark:text-red-300 font-semibold mb-2">
                  Full Reset — Nuke Everything
                </h3>
                <p className="text-red-600/70 dark:text-red-400/70 text-sm mb-3">
                  Clears all sync data, watches, event mappings, and local session. Returns to setup wizard step 1.
                  Does NOT delete Google Calendars.
                </p>
                <button
                  onClick={handleFullReset}
                  disabled={dangerLoading}
                  className="w-full bg-red-800 hover:bg-red-900 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-lg border-2 border-red-600"
                >
                  {dangerLoading ? "Resetting..." : "🔥 FULL RESET — CLEAR ALL DATA"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
