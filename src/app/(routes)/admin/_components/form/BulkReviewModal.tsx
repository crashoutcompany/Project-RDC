import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle, ChevronDown } from "lucide-react";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkProcessingResult } from "./BulkUploadModal";
import { VisionPlayer, Stat } from "@/lib/visionTypes";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FormValues } from "../../_utils/form-helpers";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SetOption {
  id: number;
  label: string;
  isNew: boolean;
}

interface MatchAssignment {
  resultId: string;
  setId: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  results: BulkProcessingResult[];
  existingSets: FormValues["sets"];
  onConfirm: (
    assignments: Map<number, BulkProcessingResult[]>,
    newSetIds: number[],
  ) => void;
  highestSetId: number;
}

/**
 * BulkReviewModal component for reviewing and assigning matches to sets
 *
 * @description
 * This component allows users to:
 * 1. Review all successfully processed screenshots with detailed match data
 * 2. Assign each match to an existing or new set
 * 3. Create new sets as needed
 * 4. Confirm assignments and update the form state
 *
 * @param props - Component props
 */
/**
 * Inner component that handles the actual modal content
 * This is remounted when the modal opens with new data via the key prop
 */
const BulkReviewModalContent = (props: Props) => {
  const { onClose, results, existingSets, onConfirm, highestSetId } = props;

  // Initialize set options with existing sets
  const initialSetOptions: SetOption[] = useMemo(
    () =>
      existingSets.map((set, index) => ({
        id: set.setId,
        label: `Set ${index + 1}`,
        isNew: false,
      })),
    [existingSets],
  );

  const [setOptions, setSetOptions] = useState<SetOption[]>(initialSetOptions);
  const [nextNewSetId, setNextNewSetId] = useState(highestSetId + 1);

  // Initialize assignments - all unassigned initially
  const [assignments, setAssignments] = useState<MatchAssignment[]>(() =>
    results.map((r) => ({
      resultId: r.id,
      setId: null,
    })),
  );

  // Expand all matches by default to show data
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(
    () => new Set(results.map((r) => r.id)),
  );

  /**
   * Toggles match expansion
   */
  const toggleMatchExpanded = useCallback((resultId: string) => {
    setExpandedMatches((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(resultId)) newSet.delete(resultId);
      else newSet.add(resultId);
      return newSet;
    });
  }, []);

  /**
   * Adds a new set option
   */
  const handleAddSet = useCallback(() => {
    const newSetId = nextNewSetId;
    setSetOptions((prev) => [
      ...prev,
      {
        id: newSetId,
        label: `Set ${prev.length + 1} (New)`,
        isNew: true,
      },
    ]);
    setNextNewSetId((prev) => prev + 1);
  }, [nextNewSetId]);

  /**
   * Updates a match assignment
   */
  const handleAssignmentChange = useCallback(
    (resultId: string, setId: number | null) => {
      setAssignments((prev) =>
        prev.map((a) => (a.resultId === resultId ? { ...a, setId } : a)),
      );
    },
    [],
  );

  /**
   * Validates and confirms the assignments
   */
  const handleConfirm = useCallback(() => {
    // Check if all matches are assigned
    const unassignedCount = assignments.filter((a) => a.setId === null).length;
    if (unassignedCount > 0) {
      return; // Button should be disabled, but just in case
    }

    // Group assignments by set
    const groupedAssignments = new Map<number, BulkProcessingResult[]>();
    assignments.forEach((assignment) => {
      if (assignment.setId === null) return;
      const result = results.find((r) => r.id === assignment.resultId);
      if (!result) return;

      if (!groupedAssignments.has(assignment.setId)) {
        groupedAssignments.set(assignment.setId, []);
      }
      groupedAssignments.get(assignment.setId)!.push(result);
    });

    // Get new set IDs
    const newSetIds = setOptions.filter((s) => s.isNew).map((s) => s.id);

    onConfirm(groupedAssignments, newSetIds);
  }, [assignments, results, setOptions, onConfirm]);

  /**
   * Gets winner names from vision data
   */
  const getWinnerNames = (winners?: VisionPlayer[]): string => {
    if (!winners || winners.length === 0) return "No winner detected";
    return winners.map((w) => w.name).join(", ");
  };

  /**
   * Formats stats for display
   */
  const formatStats = (stats: Stat[]): string => {
    if (!stats || stats.length === 0) return "No stats";
    return stats.map((s) => `${s.stat}: ${s.statValue}`).join(", ");
  };

  const unassignedCount = useMemo(
    () => assignments.filter((a) => a.setId === null).length,
    [assignments],
  );
  const canConfirm = unassignedCount === 0 && results.length > 0;

  // Memoize to avoid recalculations
  const setOptionsForSelect = useMemo(() => setOptions, [setOptions]);

  return (
    <DialogContent className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-xl">
          Review & Assign Matches to Sets
        </DialogTitle>
        <DialogDescription>
          Review the extracted match data and assign each match to a set. You
          can create new sets or use existing ones.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Sets Panel */}
        <Card className="p-4 md:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-base font-semibold">Sets</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSet}
              type="button"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Set
            </Button>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {setOptions.length === 0 ? (
                <p className="text-muted-foreground text-center text-sm">
                  No sets. Click &quot;Add Set&quot; to create one.
                </p>
              ) : (
                setOptions.map((setOption) => {
                  const assignedCount = assignments.filter(
                    (a) => a.setId === setOption.id,
                  ).length;
                  return (
                    <div
                      key={setOption.id}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{setOption.label}</span>
                        <span className="text-muted-foreground text-xs">
                          ({assignedCount} match
                          {assignedCount !== 1 ? "es" : ""})
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Matches Panel */}
        <Card className="p-4 md:col-span-3">
          <Label className="mb-3 block text-base font-semibold">
            Matches ({results.length})
          </Label>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {results.map((result, index) => {
                const assignment = assignments.find(
                  (a) => a.resultId === result.id,
                );
                const isAssigned = assignment?.setId != null;
                const isExpanded = expandedMatches.has(result.id);

                return (
                  <Collapsible
                    key={result.id}
                    open={isExpanded}
                    onOpenChange={() => toggleMatchExpanded(result.id)}
                  >
                    <div
                      className={`rounded-lg border p-3 transition-colors ${
                        isAssigned
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-yellow-500/30 bg-yellow-500/5"
                      }`}
                    >
                      {/* Header Row */}
                      <div className="flex items-start gap-3">
                        {/* Preview Image */}
                        <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded">
                          <Image
                            src={result.previewUrl}
                            alt={result.fileName}
                            fill
                            className="object-cover"
                          />
                        </div>

                        {/* Match Header */}
                        <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              Match {index + 1}
                            </span>
                            {result.status === "check" && (
                              <span className="flex items-center gap-1 text-xs text-yellow-500">
                                <AlertCircle className="h-3 w-3" />
                                Needs review
                              </span>
                            )}
                          </div>
                          <span className="text-muted-foreground truncate text-xs">
                            {result.fileName}
                          </span>
                          {result.data && (
                            <span className="text-xs">
                              <strong>Winner:</strong>{" "}
                              {getWinnerNames(result.data.winner)}
                            </span>
                          )}
                        </div>

                        {/* Set Assignment */}
                        <div className="flex shrink-0 flex-col gap-1">
                          <Label className="text-xs">Assign to Set</Label>
                          <Select
                            value={assignment?.setId?.toString() ?? ""}
                            onValueChange={(value) =>
                              handleAssignmentChange(
                                result.id,
                                value ? parseInt(value) : null,
                              )
                            }
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue placeholder="Select set..." />
                            </SelectTrigger>
                            <SelectContent>
                              {setOptionsForSelect.length === 0 ? (
                                <SelectItem disabled value="no-sets">
                                  <span className="text-muted-foreground">
                                    No sets available
                                  </span>
                                </SelectItem>
                              ) : (
                                setOptionsForSelect.map((setOption) => (
                                  <SelectItem
                                    key={setOption.id}
                                    value={setOption.id.toString()}
                                  >
                                    {setOption.label}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Expand Toggle */}
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      {/* Expanded Match Data */}
                      <CollapsibleContent>
                        {result.data && result.data.players.length > 0 && (
                          <div className="mt-3 border-t pt-3">
                            <Label className="mb-2 block text-xs font-semibold">
                              Player Stats
                            </Label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {result.data.players.map((player, pIndex) => {
                                const isWinner = result.data?.winner?.some(
                                  (w) =>
                                    w.playerId === player.playerId ||
                                    w.name === player.name,
                                );
                                return (
                                  <div
                                    key={pIndex}
                                    className={`rounded-md border p-2 text-xs ${
                                      isWinner
                                        ? "border-green-500/50 bg-green-500/10"
                                        : "bg-muted/30"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        {player.name}
                                      </span>
                                      {isWinner && (
                                        <span className="rounded bg-green-500/20 px-1 text-[10px] text-green-600">
                                          Winner
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-muted-foreground mt-1">
                                      {formatStats(player.stats)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
        <div className="flex items-center gap-2">
          {unassignedCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              {unassignedCount} unassigned match
              {unassignedCount !== 1 ? "es" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm} type="button">
            Confirm Assignments
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
};

/**
 * BulkReviewModal wrapper component
 * Uses a key to remount the inner content when the modal opens with new data
 */
const BulkReviewModal = (props: Props) => {
  const { open, onClose, results } = props;

  // Generate a unique key based on results to force remount when data changes
  const contentKey = useMemo(
    () => results.map((r) => r.id).join("-"),
    [results],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {open && results.length > 0 && (
        <BulkReviewModalContent key={contentKey} {...props} />
      )}
    </Dialog>
  );
};

export default BulkReviewModal;
