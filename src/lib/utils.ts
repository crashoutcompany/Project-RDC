import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Capitalizes the first letter of each word in a given text.
 *
 * @template T - The type of the input text.
 * @param {T} text - The text to be transformed.
 * @returns {T} - The transformed text with each word's first letter capitalized.
 */
export const capitalizeFirst = <T>(text: T) => {
  const newText = String(text)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return newText as T;
};

export const isProduction = process.env.NODE_ENV === "production";
