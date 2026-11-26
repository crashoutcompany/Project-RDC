import {
  isLowConfidence,
  PLAYER_NAME_FIELD,
  type AnalyzedPlayer,
  type LowConfidenceField,
  type Stat,
  type VisionPlayer,
} from "@/lib/visionTypes";
import type { Player } from "@/generated/prisma/client";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { getStatConfigByFieldKey, type StatConfig } from "../stat-configs";

/** A stat value after validation; `reqCheck` asks the admin to review it. */
export type StatCheck = { statValue: string; reqCheck: boolean };

type ProcessedPlayer = {
  reqCheckFlag: boolean;
  playerData: { name: string; stats: Stat[] };
  teamKey?: string;
  lowConfidence: LowConfidenceField[];
};

/**
 * Azure field names → stat config keys. Models are inconsistent about the
 * game prefix (the RL model returns "RL_Goals" for orange but "Goals" for
 * blue), so with a `statPrefix` a bare key falls back to `<prefix>_<key>`.
 */
const resolveFieldKey = (fieldName: string, statPrefix?: string): string => {
  const fieldKey = fieldName.toLowerCase();
  if (getStatConfigByFieldKey(fieldKey) || !statPrefix) return fieldKey;
  const prefixed = `${statPrefix}_${fieldKey}`;
  return getStatConfigByFieldKey(prefixed) ? prefixed : fieldKey;
};

/** Reads one scoreboard row: the name as written, and every stat validated. */
export const processPlayer = (
  player: AnalyzedPlayer,
  teamName?: string,
  statPrefix?: string,
): ProcessedPlayer => {
  let reqCheckFlag = false;
  const stats = new Map<string, Stat>();
  const lowConfidence = new Map<string, LowConfidenceField>();
  const nameConfidence = player.valueObject?.PlayerName?.confidence;
  if (isLowConfidence(nameConfidence))
    lowConfidence.set(PLAYER_NAME_FIELD, {
      field: PLAYER_NAME_FIELD,
      confidence: nameConfidence,
    });

  for (const [fieldName, field] of Object.entries(player.valueObject)) {
    if (fieldName === "PlayerName") continue;

    const fieldKey = resolveFieldKey(fieldName, statPrefix);
    const statConfig = getStatConfigByFieldKey(fieldKey);
    // A field the model returns that stat-configs doesn't know about.
    if (!statConfig)
      console.warn(`No stat config found for field: ${fieldKey}`);

    const { statValue, reqCheck } = validateVisionStatValue(
      field.content,
      statConfig?.validationRules,
      statConfig && fieldKey,
    );
    reqCheckFlag ||= reqCheck;
    stats.set(fieldKey, {
      statId: statConfig?.id || 0,
      stat: statConfig?.name || "UNKNOWN_STAT",
      statValue,
    });
    // Only low model confidence flags a field. A stat the configs don't know
    // isn't saved, so there is nothing to review.
    if (statConfig && isLowConfidence(field.confidence))
      lowConfidence.set(statConfig.name, {
        field: statConfig.name,
        confidence: field.confidence,
      });
  }

  return {
    reqCheckFlag,
    lowConfidence: [...lowConfidence.values()],
    playerData: {
      name: player.valueObject?.PlayerName?.content || "Unknown",
      stats: [...stats.values()],
    },
    teamKey: teamName,
  };
};

/**
 * Maps a row's name to a player of this session. A member's gamertags and
 * aliases come from their profile; a player with no profile (one added from
 * the admin page) is matched on their own name. Undefined for anyone else:
 * randoms in the lobby, a card subtitle read as a name, or a member who isn't
 * playing.
 */
export const validateProcessedPlayer = (
  processedPlayer: ProcessedPlayer,
  sessionPlayers: Player[],
): VisionPlayer | undefined => {
  const shown = processedPlayer.playerData.name;
  const name = (findPlayer(shown)?.playerName ?? shown).trim().toLowerCase();
  const sessionPlayer = sessionPlayers.find(
    (p) => p.playerName.toLowerCase() === name,
  );
  if (!sessionPlayer) return undefined;

  return {
    playerId: sessionPlayer.playerId,
    name: sessionPlayer.playerName,
    stats: [...processedPlayer.playerData.stats],
    teamKey: processedPlayer.teamKey,
    ...(processedPlayer.lowConfidence.length > 0 && {
      lowConfidence: processedPlayer.lowConfidence,
    }),
  };
};

export const validateVisionStatValue = (
  statValue: string | undefined,
  validationRules?: StatConfig["validationRules"],
  fieldKey?: string,
): StatCheck => {
  // Handle common OCR errors
  if (statValue === "Z" || statValue === "Ø") {
    return { statValue: "0", reqCheck: true };
  }

  if (statValue == undefined) {
    return { statValue: "0", reqCheck: true };
  }

  // Azure sometimes merges two scoreboard rows into one cell ("140\n38").
  // Keep the first value, but never store the raw multi-line string.
  const tokens = statValue.trim().split(/\s*\n\s*/);
  if (tokens.length > 1) {
    const first = validateVisionStatValue(tokens[0], validationRules, fieldKey);
    return { statValue: first.statValue, reqCheck: true };
  }

  // Strip percentage sign if present, but only for accuracy stats
  const isAccuracyStat = fieldKey?.includes("accuracy");
  const cleanedValue = isAccuracyStat
    ? statValue.replace(/%/g, "").trim()
    : statValue;

  // Additional validation
  if (validationRules) {
    const numValue = parseInt(cleanedValue, 10);

    if (isNaN(numValue)) {
      return { statValue: "0", reqCheck: true };
    }

    if (validationRules.min !== undefined && numValue < validationRules.min) {
      return { statValue: cleanedValue, reqCheck: true };
    }

    if (validationRules.max !== undefined && numValue > validationRules.max) {
      return { statValue: cleanedValue, reqCheck: true };
    }

    if (!validationRules.allowZero && numValue === 0) {
      return { statValue: cleanedValue, reqCheck: true };
    }
  }

  return { statValue: cleanedValue, reqCheck: false };
};
