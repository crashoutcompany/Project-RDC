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
 * Short date label ("Jun 23, 2025") pinned to UTC so server and browser render
 * the same text. Without an explicit timeZone, the browser's local zone can
 * shift the day and cause hydration mismatches.
 */
export const formatSessionDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
