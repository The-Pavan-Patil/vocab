"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Whether the screen this header sits in is the one showing. Every tab panel
// stays mounted (app/page.tsx), so without this the document would hold a
// hidden h1 per tab; only the visible screen's title is the h1.
export const ScreenVisibleContext = createContext(true);

// The title row every screen opens with: its name as the page's one h1, one
// grey line about the data — the session's state, the list's size — and the
// screen's real actions on the right.
export default function ScreenHeader({
  title,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const Title = useContext(ScreenVisibleContext) ? "h1" : "p";
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className
      )}
    >
      <div className="min-w-0">
        <Title className="text-xl font-semibold tracking-tight text-balance">
          {title}
        </Title>
        {children && (
          <p className="mt-1 text-sm text-muted-foreground">{children}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
