"use client";

import { useActionState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/app/actions/feedback";
import { toast } from "sonner";

// TODO Use React Form Semantics
export default function Page() {
  const [actionState, action, isPending] = useActionState<
    { error: string | null } | undefined
    // @ts-expect-error Action type incorrect.
  >(submitFeedback, undefined);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (actionState?.error === null) {
      toast.success(
        "Thank you for your feedback. We greatly appreciate it. We may be in touch if we need more information.",
        { richColors: true },
      );
      formRef.current?.reset();
    }
  }, [actionState]);

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-2xl font-semibold" data-testid="feedback-shell-marker">
        Feedback
      </h1>
      <form
        ref={formRef}
        action={action}
        method="POST"
        aria-label="Feedback form"
        className="space-y-4"
      >
        <div className="grid gap-1">
          <Label htmlFor="feedback-type">Type</Label>
          <Select name="type" required>
            <SelectTrigger id="feedback-type" className="w-full">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General feedback</SelectItem>
              <SelectItem value="bug">Bug report</SelectItem>
              <SelectItem value="feature">Feature request</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="message">Message</Label>
          <Textarea
            required
            id="message"
            name="message"
            rows={6}
            className="min-h-[140px]"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </form>
      {actionState?.error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {actionState.error}
        </p>
      )}
    </div>
  );
}
