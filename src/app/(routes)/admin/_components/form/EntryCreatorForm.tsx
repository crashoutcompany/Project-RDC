"use client";
import { useEffect, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Player } from "@/generated/prisma/client";
import SetManager from "./SetManager";
import { insertNewSessionFromAdmin } from "@/app/actions/adminAction";
import { Form } from "@/components/ui/form";
import { toast } from "sonner";
import { SessionInfo } from "./SessionInfo";
import { errorCodes } from "@/lib/constants";
import { formSchema, FormValues } from "../../_utils/form-helpers";
import {
  AnimatedFormWrapper,
  NavigationButtons,
} from "@/components/AnimatedFormWrapper";
import { motion, MotionConfig } from "motion/react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoInfo } from "./VideoInfo";
import { cn } from "@/lib/utils";
import { FormSummary } from "./Summary";
import { userSignOut } from "@/app/actions/signOut";
import { createSessionEditRequest } from "@/app/actions/editSession";

interface AdminFormProps {
  rdcMembers: Player[];
  defaultValues?: FormValues;
  type: "create" | "edit";
}

const EntryCreatorForm = ({
  rdcMembers,
  defaultValues,
  type,
}: AdminFormProps) => {
  const [step, setStep] = useState(0);
  const [modifier, setModifier] = useState(0);

  const form = useForm<FormValues, unknown>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues || {
      sessionId: undefined,
      game: "Mario Kart 8",
      sessionName: "",
      sessionUrl: "https://www.youtube.com/watch?v=",
      thumbnail: "",
      players: [],
      sets: [],
    },
    mode: "onChange",
  });
  console.log(form.formState.isDirty); // make sure formState is read before render to enable the Proxy

  const {
    handleSubmit,
    formState: { errors },
  } = form;
  console.log("Form Errors:", errors);
  /**
   * Handles the form submission for creating a new session.
   *
   * @param {FormValues} data - The form values to be submitted.
   * @returns {Promise<void>} A promise that resolves when the submission is complete.
   *
   * Logs the form data being submitted and measures the time taken for the submission process.
   * Attempts to insert a new session using the provided form data.
   * If an error occurs during the insertion, handles the error by either signing out the user
   * or displaying an error toast message.
   * If the insertion is successful, displays a success toast message and revalidates the session data.
   */
  const onSubmit = async (data: FormValues): Promise<void> => {
    console.log("Form Data Being Submitted:", {
      data,
      stringified: JSON.stringify(data, null, 2),
    });
    console.time("Form Submission Time Start: ");

    let err: string | null;
    switch (type) {
      case "create":
        err = (await insertNewSessionFromAdmin(data)).error;
        break;
      case "edit":
        if (!defaultValues?.sessionId) {
          err = "Session ID is required for editing";
          break;
        }
        // Create an edit request that admins will need to approve
        const editResult = await createSessionEditRequest(
          defaultValues.sessionId,
          data, // the form data becomes the proposed changes
          form.formState.dirtyFields,
        );
        err = editResult.error;
        break;
      default:
        err = "Invalid form type.";
    }
    console.timeEnd("Form Submission Time End: ");

    if (err) {
      if (err === errorCodes.NotAuthenticated) {
        await userSignOut();
      } else {
        toast.error(err, { richColors: true });
      }
    } else {
      const message =
        type === "create"
          ? "Session successfully created."
          : "Edit request submitted for review.";
      toast.success(message, { richColors: true });
      form.reset();
      setStep(0);
    }
  };

  /**
   * Handles form submission errors by logging them to the console and displaying a toast notification.
   *
   * @param {any} errors - The errors object containing details about the form submission errors.
   * Each key in the object corresponds to a form field, and the value is the error message for that field.
   */
  const onError = (errors: unknown) => {
    console.log("Admin Form Submission Errors:", errors);
    toast.error(`Error creating session please check all fields.`, {
      richColors: true,
    });
  };

  useEffect(() => {
    const key = "entryCreatorForm";
    const savedForm = localStorage.getItem(key);
    if (savedForm) {
      toast("Would you like to restore your previous form data?", {
        action: {
          label: "Restore",
          onClick: () => {
            try {
              const session: FormValues = JSON.parse(savedForm);
              session.date = new Date(session.date);
              form.reset(session);
            } catch (error) {
              console.error("Error restoring form data:", error);
            }
            localStorage.removeItem(key);
          },
        },
      });
    } else {
      localStorage.removeItem(key);
    }
  }, [form]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      console.log("beforeunload event triggered", form.formState.isDirty);
      if (form.formState.isDirty) {
        console.log("Got here");
        e.preventDefault();
        localStorage.setItem(
          "entryCreatorForm",
          JSON.stringify(form.getValues()),
        );
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [form.formState.isDirty, form.getValues, form]);

  useEffect(() => {
    document.documentElement.scrollTop = 0; // Scroll to top when a new set is added
  }, []);
  return (
    <MotionConfig transition={{ duration: 0.6, type: "spring", bounce: 0 }}>
      <FormProvider {...form}>
        <div className="flex w-full gap-3">
          <Card className={cn("relative col-auto flex-1 p-4")}>
            <CardHeader className="dark:text-purple-500">
              <CardTitle>Entry Creator Form</CardTitle>
            </CardHeader>
            <AnimatedFormWrapper>
              <Form {...form}>
                <form method="post" onSubmit={handleSubmit(onSubmit, onError)}>
                  <motion.div
                    key={step} // Necessary in order for animate presence to know when to rerender
                    className="space-y-4"
                    initial={{ x: `${-110 * modifier}%`, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: `${110 * modifier}%`, opacity: 0 }}
                  >
                    {step === 0 && (
                      <SessionInfo form={form} rdcMembers={rdcMembers} />
                    )}
                    {step === 1 && <SetManager />}
                    {step === 2 && <FormSummary />}
                  </motion.div>
                  <NavigationButtons
                    form={form}
                    step={step}
                    setStep={setStep}
                    setModifier={setModifier}
                  />
                </form>
              </Form>
            </AnimatedFormWrapper>
          </Card>
          {step === 0 && <VideoInfo form={form} />}
        </div>
      </FormProvider>
    </MotionConfig>
  );
};

export default EntryCreatorForm;
