"use client";
import {
  approveEditRequest,
  rejectEditRequest,
} from "@/app/actions/editSession";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

const maxLength = 300;

export const ApproveButton = ({ editId }: { editId: number }) => {
  const [note, setNote] = useState("");
  return (
    <Dialog onOpenChange={() => setNote("")}>
      <DialogTrigger asChild>
        <Button type="button">Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Edit Request</DialogTitle>
        </DialogHeader>
        <Textarea
          maxLength={maxLength}
          className="resize-y"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="button"
          onClick={async () => {
            if (note.length > maxLength) {
              toast.error(`Note must be less than ${maxLength} characters`, {
                richColors: true,
              });
            } else {
              await approveEditRequest(editId, note || undefined);
            }
          }}
        >
          Confirm
        </Button>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DeclineButton = ({ editId }: { editId: number }) => {
  const [note, setNote] = useState("");
  return (
    <Dialog onOpenChange={() => setNote("")}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline Edit Request</DialogTitle>
        </DialogHeader>
        <Textarea
          className="resize-y"
          placeholder="Optional note"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="button"
          variant="destructive"
          onClick={async () => {
            if (note.length > maxLength) {
              toast.error(`Note must be less than ${maxLength} characters`, {
                richColors: true,
              });
            } else {
              await rejectEditRequest(editId, note || undefined);
            }
          }}
        >
          Confirm
        </Button>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
