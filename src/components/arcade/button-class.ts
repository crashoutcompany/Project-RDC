import { cn } from "@/lib/utils";

export const arcadeButtonClass = (variant: "gold" | "dark" | "red" = "gold") =>
  cn(
    "ac-title inline-block border-2 px-5 py-3 text-xs transition-transform hover:-translate-y-0.5 active:translate-y-0.5",
    variant === "gold" && "bg-ac-gold text-ac-ink border-ac-ink ac-shadow",
    variant === "dark" && "bg-ac-ink text-ac-cream border-ac-cream",
    variant === "red" && "bg-ac-red text-ac-ink border-ac-ink ac-shadow-gold",
  );
