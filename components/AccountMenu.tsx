"use client";

import { DropdownMenu } from "radix-ui";
import { LogOut, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toastError } from "@/lib/notify";

// `icon`: a bare button for the phone top bar. `row`: the sidebar's foot —
// the signed-in address shown, opening the same menu upwards.
export default function AccountMenu({
  variant = "icon",
}: {
  variant?: "icon" | "row";
}) {
  const { user } = useUser();

  async function signOut() {
    // The menu closes on select; without this a slow sign-out looks like
    // nothing happened.
    const pending = toast.loading("Signing out…");
    const { error } = await createClient().auth.signOut();
    if (error) {
      toast.dismiss(pending);
      toastError("Couldn’t sign out", error, { retry: () => void signOut() });
      return;
    }
    window.location.assign("/login");
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {variant === "row" ? (
          <Button
            variant="ghost"
            className="h-8 w-full justify-start gap-2.5 px-2.5 font-normal text-muted-foreground"
          >
            <UserIcon aria-hidden />
            <span className="sr-only">Account: </span>
            <span className="truncate">{user?.email ?? "Account"}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Account">
            <UserIcon aria-hidden />
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={variant === "row" ? "start" : "end"}
          side={variant === "row" ? "top" : "bottom"}
          sideOffset={8}
          className="z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {user?.email && (
            <>
              {/* Wrapped, not truncated: the full address is the point. */}
              <div className="px-2 py-1.5 text-xs break-all text-muted-foreground">
                {user.email}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          )}
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden transition-colors data-highlighted:bg-accent data-highlighted:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
