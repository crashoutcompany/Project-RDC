import { AnimatePresence, motion } from "motion/react";
import useMeasure from "react-use-measure";
import { CardContent } from "./ui/card";
import { JSX } from "react";

export const AnimatedFormWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const [ref, bounds] = useMeasure();

  return (
    <motion.div className="overflow-hidden" animate={{ height: bounds.height }}>
      <CardContent ref={ref}>
        <AnimatePresence mode="popLayout">{children}</AnimatePresence>
      </CardContent>
    </motion.div>
  );
};
