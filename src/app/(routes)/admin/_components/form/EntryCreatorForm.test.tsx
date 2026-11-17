// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { insertNewSessionFromAdmin } from "@/app/actions/adminAction";
import { createSessionEditRequest } from "@/app/actions/editSession";
import { userSignOut } from "@/app/actions/signOut";
import { errorCodes } from "@/lib/constants";
import { mk8SessionForm } from "@/test/fixtures";
import type { FormValues } from "../../_utils/form-helpers";
import EntryCreatorForm from "./EntryCreatorForm";

// The steps' contents have their own tests; here they are placeholders so the
// shell (steps, validation between them, submission) is what gets exercised.
vi.mock("./SessionInfo", () => ({
  SessionInfo: ({ form }: { form: UseFormReturn<FormValues> }) => (
    <button
      type="button"
      onClick={() => form.setValue("sessionName", "Renamed", { shouldDirty: true })}
    >
      rename session
    </button>
  ),
}));
vi.mock("./SetManager", () => ({ default: () => <p>sets step</p> }));
vi.mock("./Summary", () => ({ FormSummary: () => <p>summary step</p> }));
vi.mock("./VideoInfo", () => ({ VideoInfo: () => <p>video preview</p> }));
vi.mock("@/components/AnimatedFormWrapper", () => ({
  AnimatedFormWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/actions/adminAction", () => ({ insertNewSessionFromAdmin: vi.fn() }));
vi.mock("@/app/actions/editSession", () => ({ createSessionEditRequest: vi.fn() }));
vi.mock("@/app/actions/signOut", () => ({ userSignOut: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const MEMBERS = [{ playerId: 1, playerName: "Mark" }];
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const next = async (arrivesAt: string) => {
  click("Next");
  await screen.findByText(arrivesAt);
};

const renderEdit = () =>
  render(<EntryCreatorForm rdcMembers={MEMBERS} defaultValues={mk8SessionForm()} type="edit" />);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("EntryCreatorForm", () => {
  it("opens on the session step, with the video preview beside it", () => {
    render(<EntryCreatorForm rdcMembers={MEMBERS} type="create" />);

    expect(screen.getByRole("button", { name: "rename session" })).toBeDefined();
    expect(screen.getByText("video preview")).toBeDefined();
    expect(screen.getByRole("button", { name: "Back" })).toHaveProperty("disabled", true);
  });

  it("does not leave a step whose fields are invalid", async () => {
    render(<EntryCreatorForm rdcMembers={MEMBERS} type="create" />);

    click("Next");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Form is invalid", { richColors: true }),
    );
    expect(screen.queryByText("sets step")).toBeNull();
  });

  it("walks a valid session through sets to the summary, and back", async () => {
    renderEdit();

    await next("sets step");
    expect(screen.queryByText("video preview")).toBeNull();
    await next("summary step");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    click("Back");
    await screen.findByText("sets step");
  });

  it("only allows submitting once something has changed", async () => {
    renderEdit();
    await next("sets step");
    await next("summary step");

    expect(screen.getByRole("button", { name: "Submit" })).toHaveProperty("disabled", true);
  });

  const changeAndReachSummary = async () => {
    renderEdit();
    click("rename session");
    await next("sets step");
    await next("summary step");
  };

  it("submits an edit as a request with what changed, then starts over", async () => {
    vi.mocked(createSessionEditRequest).mockResolvedValue({ error: null });
    await changeAndReachSummary();

    click("Submit");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Edit request submitted for review.", {
        richColors: true,
      }),
    );
    expect(createSessionEditRequest).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ sessionName: "Renamed", game: "Mario Kart 8" }),
      expect.objectContaining({ sessionName: true }),
    );
    expect(insertNewSessionFromAdmin).not.toHaveBeenCalled();
    await screen.findByText("video preview");
  });

  it("shows the server's error and stays on the summary", async () => {
    vi.mocked(createSessionEditRequest).mockResolvedValue({ error: "No changes detected to submit." });
    await changeAndReachSummary();

    click("Submit");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No changes detected to submit.", { richColors: true }),
    );
    expect(screen.getByText("summary step")).toBeDefined();
  });

  it("signs the user out when the server says they are not an admin", async () => {
    vi.mocked(createSessionEditRequest).mockResolvedValue({ error: errorCodes.NotAuthenticated });
    await changeAndReachSummary();

    click("Submit");

    await waitFor(() => expect(userSignOut).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
