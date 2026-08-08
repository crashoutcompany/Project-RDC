import { cn } from "@/lib/utils";
import * as React from "react";

type HeaderProps = {
  id?: string;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLHeadingElement>, "id" | "children" | "className">;

/**
 * Primary page heading. Accepts standard heading HTML attributes (e.g. data-testid).
 */
export const H1 = ({ id, children, className, ...props }: HeaderProps) => (
  <h1 id={id} className={cn("my-6 text-3xl font-bold", className)} {...props}>
    {children}
  </h1>
);

/**
 * Secondary section heading.
 */
export const H2 = ({ id, children, className, ...props }: HeaderProps) => (
  <h2
    id={id}
    className={cn("text-2xl font-semibold", className)}
    {...props}
  >
    {children}
  </h2>
);

/**
 * Tertiary section heading.
 */
export const H3 = ({ id, children, className, ...props }: HeaderProps) => (
  <h3
    id={id}
    className={cn("text-xl font-semibold", className)}
    {...props}
  >
    {children}
  </h3>
);
