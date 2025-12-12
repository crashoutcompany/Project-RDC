import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  ScanEye,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Player } from "@/generated/prisma/client";
import Image from "next/image";
import { VisionResultCodes } from "@/lib/constants";
import { toast } from "sonner";
import { handleAnalyzeBtnClick } from "../../_utils/rdc-vision-helpers";
import { VisionPlayer } from "@/lib/visionTypes";
import { z } from "zod/v4";
import { handleClose } from "../../vision/helpers";

interface Props {
  handleCreateMatchFromVision: (
    visionPlayers: VisionPlayer[],
    visionWinners: VisionPlayer[],
  ) => void;
  sessionPlayers: Player[];
  gameName: string;
}

const initialState = {
  selectedFile: null as File | null,
  isLoading: false,
  visionStatus: null as VisionResultCodes | null,
  visionMsg: "",
  previewUrl: null as string | null,
};

/**
 * State reducer for RDC Vision modal
 *
 * @description
 * This reducer handles:
 * 1. File selection and preview state updates
 * 2. Vision processing status management
 * 3. Loading state control
 * 4. State reset functionality
 *
 * Actions:
 * - UPDATE_FILE: Updates selected file and preview URL
 * - UPDATE_VISION: Updates vision processing status and message
 * - UPDATE_LOADING: Controls loading state
 * - RESET: Resets state to initial values
 *
 * @param state - Current state object
 * @param action - Action to process
 * @returns Updated state object
 */
const zodFile = z
  .file({ error: "File is required." })
  .mime(["image/jpeg", "image/png", "image/jpg"], {
    error: "Invalid file type. Please upload a valid image.",
  });

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "UPDATE_FILE":
      return {
        ...state,
        selectedFile: action.file,
        previewUrl: action.previewUrl,
      };
    case "UPDATE_VISION":
      return {
        ...state,
        visionStatus: action.visionStatus,
        visionMsg: action.visionMsg,
        isLoading: action.loading ?? state.isLoading,
      };
    case "UPDATE_LOADING":
      return { ...state, isLoading: action.loading };
    case "RESET":
      return initialState;
    default:
      return state;
  }
};

/**
 * Converts a File object to a base64 encoded string
 *
 * @description
 * This function:
 * 1. Creates a FileReader to read the file as an ArrayBuffer
 * 2. Returns a Promise that resolves with the base64 encoded content
 * 3. Handles errors during file reading
 * 4. Converts ArrayBuffer to base64 string using Buffer
 *
 * @param selectedFile - The File object to convert
 * @returns Promise that resolves with the base64 encoded string, or undefined if reading fails
 * @throws Logs error if file reading fails
 */
const getFileAsBase64 = async (selectedFile: File) => {
  const reader = new FileReader();

  const readFile = () =>
    new Promise((resolve, reject) => {
      reader.onload = async (e) => resolve(e.target?.result);
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(selectedFile);
    });
  const fileContent = await readFile();

  if (!fileContent) {
    console.error("Error reading file content");
    return;
  }

  const base64FileContent = Buffer.from(fileContent as ArrayBuffer).toString(
    "base64",
  );

  return base64FileContent;
};

const RDCVisionModal = (props: Props) => {
  const { handleCreateMatchFromVision, sessionPlayers, gameName } = props;

  const [state, dispatch] = useReducer(reducer, initialState);
  const [open, setOpen] = useState(false);

  // Add a ref to always have the latest value of open
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const { selectedFile, isLoading, visionStatus, visionMsg, previewUrl } =
    state;

  const visionButton = useRef<HTMLButtonElement>(null);

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        const file = item.getAsFile();
        if (!file) continue;
        const validationResult = zodFile.safeParse(file);

        if (validationResult.success) {
          const url = URL.createObjectURL(file);
          dispatch({ type: "UPDATE_FILE", file, previewUrl: url });
          setTimeout(() => visionButton.current?.focus(), 0);
          return; // Exit after finding the first valid image
        } else {
          // Log error for developers but don't toast for a better UX
          console.warn("Invalid file pasted:", validationResult.error);
        }
      }

      // Toast only if no valid image was found after checking all items
      toast.error("No valid image file found in clipboard", {
        richColors: true,
      });
      dispatch({ type: "UPDATE_FILE", file: null, previewUrl: null });
    },
    [], // Remove open from dependencies
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("paste", handlePaste);
      return () => {
        document.removeEventListener("paste", handlePaste);
      };
    }
  }, [open, handlePaste]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const uploadedFile = event.target.files[0];
    const validationResult = zodFile.safeParse(uploadedFile);

    if (!validationResult.success) {
      console.error(validationResult.error);
      toast.error(validationResult.error.message, {
        richColors: true,
      });
      dispatch({ type: "UPDATE_FILE", file: null, previewUrl: null });
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(uploadedFile);
    dispatch({ type: "UPDATE_FILE", file: uploadedFile, previewUrl: url });
    // Focus after state update
    setTimeout(() => {
      visionButton.current?.focus();
    }, 0);
  };

  // Wrap analyze click to close modal on success
  const handleAnalyzeAndMaybeClose = async () => {
    if (!state.selectedFile) {
      toast.warning("Please select a file to analyze.", {
        richColors: true,
      });
      return;
    }

    const base64FileContent = await getFileAsBase64(state.selectedFile);

    if (!base64FileContent) {
      toast.warning("Could not read the selected file. Please try again.", {
        richColors: true,
      });
      return;
    }

    dispatch({ type: "UPDATE_LOADING", loading: true });

    const result = await handleAnalyzeBtnClick(
      base64FileContent,
      sessionPlayers,
      gameName,
    );

    if (
      result.status === VisionResultCodes.CheckRequest ||
      result.status === VisionResultCodes.Success
    )
      handleCreateMatchFromVision(
        result.data.players,
        result.data.winner || [],
      );

    switch (result.status) {
      case VisionResultCodes.Success:
        dispatch({
          type: "UPDATE_VISION",
          visionStatus: VisionResultCodes.Success,
          visionMsg: result.message,
        });
        toast.success("Success", { richColors: true });
        setOpen(false); // Close modal on success
        break;
      case VisionResultCodes.CheckRequest:
        dispatch({
          type: "UPDATE_VISION",
          visionStatus: VisionResultCodes.CheckRequest,
          visionMsg: result.message,
        });
        toast.warning(result.message, { richColors: true });
        break;
      case VisionResultCodes.Failed:
        dispatch({
          type: "UPDATE_VISION",
          visionStatus: VisionResultCodes.Failed,
          visionMsg: result.message,
        });
        toast.error(result.message, { richColors: true });
        break;
      default:
        break;
    }

    dispatch({ type: "UPDATE_LOADING", loading: false });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={async (v) => {
        setOpen(v);
        if (!v) await handleClose(previewUrl, dispatch);
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground my-2 rounded-sm p-4">
          <ScanEye />
          Import Stats
        </Button>
      </DialogTrigger>
      <DialogContent className="flex min-h-[300px] w-full max-w-md flex-col items-center gap-4 transition-all duration-300 ease-in-out">
        <DialogDescription className="text-xs">
          {" "}
          Select a screenshot of the game stats to import the match data
        </DialogDescription>
        <DialogTitle className="text-2xl">
          Import Stats From Screenshot
        </DialogTitle>
        <h2 className="mb-4 text-base">Upload Screenshot for Game Stats</h2>
        <div
          className="flex h-48 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed"
          tabIndex={0}
          role="button"
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Pasted preview"
              width={300}
              height={200}
              className="object-contain"
            />
          ) : (
            <p>Paste an image (Ctrl+V/⌘+V)</p>
          )}
        </div>
        <p className="font-semibold underline underline-offset-2"> OR </p>
        <Input
          type="file"
          accept="image/*"
          multiple={false}
          onChange={handleFileChange}
          className="hover:bg-primary-foreground hover:cursor-pointer"
          tabIndex={1}
        />
        <Button
          ref={visionButton}
          className="focus:ring-primary focus:bg-primary/90 w-full max-w-[200px] transition-all duration-150 focus:ring-2 focus:ring-offset-2 focus:outline-none sm:w-auto"
          disabled={!selectedFile || sessionPlayers.length === 0 || isLoading}
          onClick={handleAnalyzeAndMaybeClose}
          type="button"
        >
          Extract Stats from Image
        </Button>
        {isLoading && (
          <div className="flex justify-center">
            <LoaderCircle className="animate-spin" />
          </div>
        )}
        <span className="my-2 flex flex-col items-center">
          {visionStatus !== null && (
            <>
              <p className="text-lg">Vision Results:</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    {visionStatus === VisionResultCodes.Success ? (
                      <CircleCheck size={40} className="text-green-500" />
                    ) : visionStatus === VisionResultCodes.CheckRequest ? (
                      <CircleAlert size={40} className="text-yellow-500" />
                    ) : (
                      <CircleX size={40} className="text-red-500" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent className="bg-primary-foreground text-primary max-w-72">
                    <p className="text-sm">
                      <strong>
                        {visionStatus === VisionResultCodes.Success
                          ? "Stats have been imported to a new match successfully. Make sure to double check still!"
                          : visionStatus === VisionResultCodes.CheckRequest
                            ? "Stats have been imported to a new match but the model had some trouble recognizing some fields. Please check to make sure it got it correct."
                            : "Stat import has failed due to an error please check the screenshot and try again."}
                      </strong>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          {visionMsg && <p className="text-muted-foreground">{visionMsg}</p>}
        </span>
      </DialogContent>
    </Dialog>
  );
};

export default RDCVisionModal;

export type State = typeof initialState;

export type Action =
  | { type: "UPDATE_FILE"; file: File | null; previewUrl: string | null }
  | {
      type: "UPDATE_VISION";
      visionStatus: VisionResultCodes | null;
      visionMsg: string;
      loading?: boolean;
    }
  | { type: "UPDATE_LOADING"; loading: boolean }
  | { type: "RESET" };
