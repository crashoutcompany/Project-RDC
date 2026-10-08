import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormValues } from "../../_utils/form-helpers";
import Image from "next/image";
import { motion } from "motion/react";
import { H3 } from "@/components/headings";
import { toast } from "sonner";

export const VideoInfo = ({
  form,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
}) => {
  const thumbnail = form.watch("thumbnail");
  const sessionName = form.watch("sessionName");
  const date = form.watch("date");
  // Track which URL failed so the fallback survives re-renders (form.watch
  // re-renders constantly) and a new thumbnail gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === thumbnail;

  if (!thumbnail) {
    return null;
  }
  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      className="relative flex-1"
    >
      <H3>{sessionName}</H3>
      <div className="text-muted-foreground text-sm">{date.toDateString()}</div>
      <motion.div
        animate={{ y: 216 }}
        transition={{ duration: 0.6, type: "spring", bounce: 0 }}
        className="bg-background absolute h-[216px] w-[384px]"
      />
      <Image
        src={failed ? "/images/leland_rdc.jpg" : thumbnail} // TODO get default image
        height={216} // 16:9 aspect ratio
        width={384}
        alt={failed ? "Leland from RDC" : "RDC Youtube Video Thumbnail"}
        onError={() => {
          if (failed) return;
          setFailedSrc(thumbnail);
          toast.warning("Image failed to load, here's a picture of leland.", {
            richColors: true,
          });
        }}
      />
    </motion.div>
  );
};
