"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="gap-2 rounded-xl hover:text-destructive"
    >
      <LogOut className="h-4 w-4" />
      Keluar
    </Button>
  );
}
