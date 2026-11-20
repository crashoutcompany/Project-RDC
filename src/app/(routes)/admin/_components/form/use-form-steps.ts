import { useState } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

export type FormStep<Values extends FieldValues> = {
  id: string;
  /** The fields that must be valid before moving past this step. */
  fieldsToValidate?: (values: Values) => FieldPath<Values>[];
};

/**
 * Walks a form through its steps. `next` validates the current step's fields
 * first and resolves to false, staying put, when they don't pass. `direction`
 * is 1 after moving forward and -1 after moving back, for slide animations.
 */
export function useFormSteps<Values extends FieldValues>(
  form: UseFormReturn<Values>,
  steps: FormStep<Values>[],
) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const next = async () => {
    const fields = steps[index].fieldsToValidate?.(form.getValues());
    if (fields && !(await form.trigger(fields))) return false;
    setDirection(1);
    setIndex((current) => current + 1);
    return true;
  };

  const back = () => {
    setDirection(-1);
    setIndex((current) => current - 1);
  };

  return {
    index,
    id: steps[index].id,
    direction,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    next,
    back,
    restart: () => setIndex(0),
  };
}
