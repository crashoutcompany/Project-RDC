import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Arcade buttons: pixel type, hard 2px outline and an offset drop shadow that
// lifts on hover and presses in on click.
const buttonVariants = cva(
  "ac-title inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-2 text-[0.625rem] transition-[transform,background-color,color] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-background ac-shadow hover:-translate-y-0.5 active:translate-y-0.5",
        destructive:
          "bg-destructive text-background border-background ac-shadow-gold hover:-translate-y-0.5 active:translate-y-0.5",
        outline:
          "bg-background text-foreground border-foreground hover:bg-foreground hover:text-background active:translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground border-secondary ac-bevel hover:bg-secondary/80",
        ghost:
          "border-transparent hover:bg-accent hover:text-accent-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 text-[0.55rem] has-[>svg]:px-2.5",
        lg: "px-5 py-3 text-xs",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
