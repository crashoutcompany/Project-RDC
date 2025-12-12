import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Controller, UseFormReturn } from "react-hook-form";
import GameDropDownForm from "./GameDropDownForm";
import PlayerSelector from "./PlayerSelector";
import { useTransition } from "react";
import { getRDCVideoDetails } from "@/app/actions/action";
import { toast } from "sonner";
import { errorCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { FormValues } from "../../_utils/form-helpers";
import { getVideoId } from "../../_utils/helper-functions";
import { authClient } from "@/lib/auth-client";
import { usePostHog } from "posthog-js/react";

export const SessionInfo = ({
  form,
  rdcMembers,
}: {
  form: UseFormReturn<FormValues>;
  rdcMembers: Player[];
}) => {
  const [isPending, startTransition] = useTransition();
  const {
    control,
    formState: { defaultValues },
  } = form;
  const posthog = usePostHog();
  const { data: session } = authClient.useSession();

  /**
   * Handles the URL update process for a session.
   *
   * @description
   * This function performs the following steps:
   * 1. Validates that the video ID is not already linked
   * 2. Validates the URL format and ensures it's different from default values
   * 3. Fetches video details from the YouTube API
   * 4. Updates form fields with video metadata (title, thumbnail, date)
   * 5. Handles error cases including authentication failures
   *
   * @async
   * @function handleUrlUpdated
   * @returns {void} A promise that resolves when the URL update process is complete.
   */
  const handleUrlUpdated = (): void => {
    startTransition(async () => {
      // TODO Debounce/Rate limit
      const url = form.getValues("sessionUrl");
      const videoId = getVideoId(url);

      if (videoId === form.getValues("videoId")) {
        toast("Video already linked");
        return;
      }

      // Check if url is valid.
      if (
        defaultValues?.sessionUrl === url ||
        control.getFieldState("sessionUrl").invalid ||
        videoId.length === 0
      ) {
        toast.error("Invalid url", { richColors: true });
        return;
      }

      const distinctId = posthog.get_distinct_id();

      const { error, video } = await getRDCVideoDetails(
        videoId,
        form.getValues("game"),
        session?.user?.email ?? distinctId,
      );

      if (error !== undefined) {
        if (error === errorCodes.NotAuthenticated) await authClient.signOut();
        else {
          form.reset(undefined, { keepIsValid: true });
          toast.error(error, { richColors: true });
        }
      } else {
        const thumbnail =
          typeof video.thumbnail === "string"
            ? video.thumbnail
            : video.thumbnail.url;
        form.setValue("sessionName", video.sessionName);
        form.setValue("thumbnail", thumbnail);
        form.setValue("date", new Date(video.date));
        form.setValue("videoId", videoId);
        toast.success("Youtube video successfully linked.", {
          richColors: true,
        });
      }
    });
  };
  return (
    <>
      <div className="gap-2">
        <FormField
          control={control}
          name="sessionUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session URL</FormLabel>
              <Input
                className="my-2 rounded-md border p-2"
                placeholder="Session URL"
                {...field}
              />
              <FormMessage />
              <FormDescription>A valid video is required</FormDescription>
            </FormItem>
          )}
        />
        <Button
          className="my-2"
          disabled={isPending}
          style={{ alignSelf: "end" }}
          onClick={handleUrlUpdated}
          type="button"
          variant="default"
        >
          Update URL
        </Button>
      </div>
      <div id="entry-creator-form-info-subheader" className="my-5">
        <Controller
          name="game"
          control={control}
          render={({ field }) => (
            <GameDropDownForm
              field={field}
              control={form.control}
              reset={form.resetField}
            />
          )}
        />
      </div>
      <FormField
        control={control}
        name="players"
        render={({ field }) => (
          <FormItem>
            <PlayerSelector
              rdcMembers={rdcMembers}
              control={form.control}
              field={field}
              currentSelectedPlayers={field.value}
              label="Session Players"
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};
