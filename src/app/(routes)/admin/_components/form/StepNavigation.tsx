import { LoaderIcon } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";

type StepNavigationProps = {
  isFirstStep: boolean;
  isLastStep: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  onBack: () => void;
  onNext: () => void;
};

/** Back / Next buttons for a stepped form; the last step submits instead. */
export const StepNavigation = ({
  isFirstStep,
  isLastStep,
  isSubmitting,
  canSubmit,
  onBack,
  onNext,
}: StepNavigationProps) => (
  <motion.div layout>
    <CardFooter className="my-2 space-x-4">
      <Button
        type="button"
        onClick={onBack}
        className="cursor-pointer disabled:cursor-not-allowed"
        variant="secondary"
        disabled={isFirstStep}
      >
        Back
      </Button>
      {isLastStep ? (
        <Button
          disabled={isSubmitting || !canSubmit}
          className="cursor-pointer"
          type="submit"
        >
          <motion.span
            initial={{ y: -25 }}
            animate={{ y: 0 }}
            exit={{ y: 25 }}
            key={String(isSubmitting)}
          >
            {isSubmitting ? (
              <span className="animate-spin">
                <LoaderIcon />
              </span>
            ) : (
              <span>Submit</span>
            )}
          </motion.span>
        </Button>
      ) : (
        <Button type="button" onClick={onNext} className="my-2 cursor-pointer">
          Next
        </Button>
      )}
    </CardFooter>
  </motion.div>
);
