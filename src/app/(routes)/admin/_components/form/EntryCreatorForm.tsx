"use client";
import { useEffect } from "react";
import { useForm, FormProvider, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import { Player } from "@/generated/prisma/client";
import { userSignOut } from "@/app/actions/signOut";
import { AnimatedFormWrapper } from "@/components/AnimatedFormWrapper";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { errorCodes } from "@/lib/constants";
import { formSchema, FormValues } from "../../_utils/form-helpers";
import { draftKey, type SessionFormMode } from "../../_utils/session-draft";
import { submitSession, SUBMIT_SUCCESS } from "../../_utils/submit-session";
import { SessionInfo } from "./SessionInfo";
import SetManager from "./SetManager";
import { StepNavigation } from "./StepNavigation";
import { FormSummary } from "./Summary";
import { VideoInfo } from "./VideoInfo";
import { useFormSteps, type FormStep } from "./use-form-steps";
import { useSessionDraft } from "./use-session-draft";

interface AdminFormProps {
  rdcMembers: Player[];
  /** The stored session when editing; a blank session otherwise. */
  defaultValues?: FormValues;
  type: SessionFormMode;
}

const BLANK_SESSION: DefaultValues<FormValues> = {
  sessionId: undefined,
  game: "Mario Kart 8",
  sessionName: "",
  sessionUrl: "https://www.youtube.com/watch?v=",
  thumbnail: "",
  players: [],
  dayWinners: [],
  sets: [],
};

/** The form's pages, and what each needs valid before the next one opens. */
const STEPS: FormStep<FormValues>[] = [
  {
    id: "session",
    // TODO Validate video and game combo not already existing.
    fieldsToValidate: () => [
      "game",
      "date",
      "sessionName",
      "sessionUrl",
      "thumbnail",
      "videoId",
      "players",
    ],
  },
  {
    id: "sets",
    fieldsToValidate: ({ sets }) => [
      "sets",
      ...sets.flatMap((set, setIndex) =>
        set.matches.flatMap((match, matchIndex) =>
          match.playerSessions.map(
            (_, sessionIndex) =>
              `sets.${setIndex}.matches.${matchIndex}.playerSessions.${sessionIndex}.playerStats` as const,
          ),
        ),
      ),
    ],
  },
  { id: "summary" },
];

/**
 * The stepped form for recording a session (session details, then sets and
 * matches, then a summary) or proposing an edit to an existing one.
 */
const EntryCreatorForm = ({
  rdcMembers,
  defaultValues,
  type,
}: AdminFormProps) => {
  const form = useForm<FormValues, unknown>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues ?? BLANK_SESSION,
    mode: "onChange",
  });
  const { isDirty, isSubmitting } = form.formState;
  const steps = useFormSteps(form, STEPS);
  useSessionDraft(form, draftKey(type, defaultValues?.sessionId));

  useEffect(() => {
    document.documentElement.scrollTop = 0;
  }, []);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const error = await submitSession(type, values, {
      sessionId: defaultValues?.sessionId,
      // Read at submit time: the form state object always holds the latest.
      dirtyFields: form.formState.dirtyFields,
    });

    if (error === errorCodes.NotAuthenticated)
      return void (await userSignOut());
    if (error) return void toast.error(error, { richColors: true });

    toast.success(SUBMIT_SUCCESS[type], { richColors: true });
    form.reset();
    steps.restart();
  };

  const onInvalid = () =>
    toast.error("Error creating session please check all fields.", {
      richColors: true,
    });

  const onNext = async () => {
    if (!(await steps.next()))
      toast.error("Form is invalid", { richColors: true });
  };

  return (
    <MotionConfig transition={{ duration: 0.6, type: "spring", bounce: 0 }}>
      <FormProvider {...form}>
        <div className="flex w-full gap-3">
          <Card className="relative col-auto flex-1 p-4">
            <CardHeader className="dark:text-purple-500">
              <CardTitle>Entry Creator Form</CardTitle>
            </CardHeader>
            <AnimatedFormWrapper>
              <Form {...form}>
                <form
                  method="post"
                  onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                >
                  <motion.div
                    key={steps.id} // Lets AnimatePresence swap one step for the next.
                    className="space-y-4"
                    initial={{ x: `${-110 * steps.direction}%`, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: `${110 * steps.direction}%`, opacity: 0 }}
                  >
                    {steps.id === "session" && (
                      <SessionInfo form={form} rdcMembers={rdcMembers} />
                    )}
                    {steps.id === "sets" && <SetManager />}
                    {steps.id === "summary" && <FormSummary />}
                  </motion.div>
                  <StepNavigation
                    isFirstStep={steps.isFirst}
                    isLastStep={steps.isLast}
                    isSubmitting={isSubmitting}
                    canSubmit={isDirty}
                    onBack={steps.back}
                    onNext={onNext}
                  />
                </form>
              </Form>
            </AnimatedFormWrapper>
          </Card>
          {steps.id === "session" && <VideoInfo form={form} />}
        </div>
      </FormProvider>
    </MotionConfig>
  );
};

export default EntryCreatorForm;
