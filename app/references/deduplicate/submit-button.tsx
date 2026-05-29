"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
      {pending ? "Menghapus..." : "Hapus"}
    </Button>
  );
}
