// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { codSessionForm } from "@/test/fixtures";
import type { FormValues } from "../../_utils/form-helpers";
import { useFormSteps, type FormStep } from "./use-form-steps";
import { useSessionDraft } from "./use-session-draft";

vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useFormSteps", () => {
  type Values = { name: string; age: number };
  const STEPS: FormStep<Values>[] = [
    { id: "name", fieldsToValidate: () => ["name"] },
    { id: "age" },
    { id: "done" },
  ];
  const setup = (name: string) =>
    renderHook(() => {
      const form = useForm<Values>({ defaultValues: { name, age: 1 } });
      form.register("name", { required: true });
      return useFormSteps(form, STEPS);
    });

  it("moves forward once the step's fields are valid, and back again", async () => {
    const { result } = setup("Mark");
    expect(result.current).toMatchObject({ id: "name", isFirst: true, isLast: false });

    await act(async () => expect(await result.current.next()).toBe(true));
    expect(result.current).toMatchObject({ id: "age", direction: 1, isFirst: false });

    await act(async () => void (await result.current.next()));
    expect(result.current).toMatchObject({ id: "done", isLast: true });

    act(() => result.current.back());
    expect(result.current).toMatchObject({ id: "age", direction: -1 });
  });

  it("stays on a step whose fields are invalid", async () => {
    const { result } = setup("");

    await act(async () => expect(await result.current.next()).toBe(false));

    expect(result.current.id).toBe("name");
  });

  it("restarts from the first step", async () => {
    const { result } = setup("Mark");
    await act(async () => void (await result.current.next()));

    act(() => result.current.restart());

    expect(result.current.id).toBe("name");
  });
});

describe("useSessionDraft", () => {
  const BLANK = { sessionName: "", players: [], dayWinners: [], sets: [] };
  const setup = (key: string) =>
    renderHook(() => {
      const form = useForm<FormValues>({ defaultValues: BLANK });
      useSessionDraft(form, key);
      return form;
    });
  const restore = () => {
    const [, options] = vi.mocked(toast).mock.calls[0] as unknown as [
      string,
      { action: { onClick: () => void } },
    ];
    act(() => options.action.onClick());
  };

  it("offers nothing when there is no draft", () => {
    setup("entryCreatorForm");

    expect(toast).not.toHaveBeenCalled();
  });

  it("restores a saved draft as unsaved changes, and clears it", () => {
    localStorage.setItem("entryCreatorForm", JSON.stringify(codSessionForm()));
    const { result } = setup("entryCreatorForm");
    expect(toast).toHaveBeenCalledTimes(1);

    restore();

    expect(result.current.getValues("sessionName")).toBe("CoD Night");
    expect(result.current.getValues("date")).toBeInstanceOf(Date);
    // Restored values count as changes, so the form can be submitted.
    expect(result.current.formState.isDirty).toBe(true);
    expect(result.current.formState.dirtyFields.sessionName).toBe(true);
    expect(localStorage.getItem("entryCreatorForm")).toBeNull();
  });

  it("does not offer another form's draft", () => {
    localStorage.setItem("entryCreatorForm", JSON.stringify(codSessionForm()));

    setup("entryCreatorForm:edit:7");

    expect(toast).not.toHaveBeenCalled();
  });

  it("saves unsaved changes when the page is left, and asks to confirm", () => {
    const { result } = setup("entryCreatorForm");
    act(() => result.current.setValue("sessionName", "Half typed", { shouldDirty: true }));

    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(true);
    expect(JSON.parse(localStorage.getItem("entryCreatorForm")!)).toMatchObject({
      sessionName: "Half typed",
    });
  });

  it("lets the page close silently when nothing changed", () => {
    setup("entryCreatorForm");

    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(false);
    expect(localStorage.getItem("entryCreatorForm")).toBeNull();
  });
});
