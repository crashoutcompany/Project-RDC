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
 * Short date label ("Jun 23, 2025") in Eastern Time. The explicit locale and
 * timeZone keep server and browser output identical, so the browser's own zone
 * cannot shift the day and cause hydration mismatches.
 */
export const formatSessionDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

/** A 0..1 share as a whole percentage, or "--" when there is no data. */
export const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;
