"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getLatestDbSwitchEntry,
  type DbSwitchEntry,
} from "@/app/actions/getDbSwitchStatus";

const STORAGE_KEY = "rdc-last-db-switch-timestamp";

function isNewEntry(entry: DbSwitchEntry): boolean {
  if (typeof window === "undefined") return false;

  const lastTimestamp = localStorage.getItem(STORAGE_KEY);
  return lastTimestamp !== entry.timestamp;
}

function markAsSeen(entry: DbSwitchEntry): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, entry.timestamp);
}

/** Dev-only toast when husky switches Neon DB; once per switch via localStorage. */
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
