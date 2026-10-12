import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const capitalizeFirst = <T>(text: T) => {
  const newText = String(text)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return newText as T;
};

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Formats a session date as e.g. "Oct 11, 2026", pinned to Eastern Time so the
 * server (UTC) and the browser render the same day.
 */
export const formatSessionDate = (date: Date | string | number) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
