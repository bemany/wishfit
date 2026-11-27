import { buttonVariants } from "@heroui/react";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "tertiary" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
};

/** A link that looks like a HeroUI Button. External URLs open in a new tab. */
export function ButtonLink({ href, children, variant = "primary", fullWidth, className }: Props) {
  const cls = buttonVariants({ variant, fullWidth, className });
  return /^https?:/.test(href) ? (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link className={cls} href={href}>
      {children}
    </Link>
  );
}
