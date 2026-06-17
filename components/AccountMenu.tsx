"use client";

import { DropdownMenu } from "radix-ui";
import { LogOut, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";

export default function AccountMenu() {
  const { user } = useUser();

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserIcon aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {user?.email && (
            <>
              <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                {user.email}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          )}
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-muted data-highlighted:bg-muted"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
