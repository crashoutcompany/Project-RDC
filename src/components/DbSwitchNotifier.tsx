"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getLatestDbSwitchEntry,
  type DbSwitchEntry,
} from "@/app/actions/getDbSwitchStatus";

const STORAGE_KEY = "rdc-last-db-switch-timestamp";

/**
 * Checks if the database switch entry is new (hasn't been shown to the user yet)
 * @param entry - The database switch entry to check
 * @returns true if this is a new entry that should trigger a notification
 */
function isNewEntry(entry: DbSwitchEntry): boolean {
  if (typeof window === "undefined") return false;

  const lastTimestamp = localStorage.getItem(STORAGE_KEY);
  return lastTimestamp !== entry.timestamp;
}

/**
 * Marks the entry as seen by storing its timestamp in localStorage
 * @param entry - The database switch entry to mark as seen
 */
function markAsSeen(entry: DbSwitchEntry): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, entry.timestamp);
}

/**
 * Client component that shows a toast notification when the database URL has changed.
 * This happens when switching git branches and the husky post-checkout hook runs.
 *
 * The notification only shows once per database switch (tracked via localStorage).
 * Only active in development mode.
 */
export function DbSwitchNotifier() {
  const hasChecked = useRef(false);

  useEffect(() => {
    // Only check once on mount
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkDbSwitch() {
      const entry = await getLatestDbSwitchEntry();

      if (!entry || !isNewEntry(entry)) return;

      // Mark as seen before showing toast to prevent duplicate notifications
      markAsSeen(entry);

      toast.info("Database URL Changed", {
        description: `Switched to Neon branch: ${entry.neonBranch} (${entry.endpoint})`,
        duration: 5000,
      });
    }

    checkDbSwitch();
  }, []);

  return null;
}
