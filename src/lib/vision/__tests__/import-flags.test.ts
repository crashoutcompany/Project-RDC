import { describe, expect, it } from "vitest";
import { collectImportFlags } from "../import-flags";

const match = (
  visionFlags: { playerId: number; field: string; value: string; confidence: number }[],
  place = "2",
) => ({
  visionFlags,
  playerSessions: [
    { playerId: 1, playerStats: [{ stat: "MK8_POS", statValue: place }] },
  ],
});

describe("collectImportFlags", () => {
  it("locates each flag by set and match position", () => {
    const flag = { playerId: 1, field: "MK8_POS", value: "2", confidence: 0.4 };

    expect(
      collectImportFlags([{ matches: [match([])] }, { matches: [match([]), match([flag])] }]),
    ).toEqual([
      { setIndex: 1, matchIndex: 1, playerId: 1, field: "MK8_POS", readValue: "2", confidence: 0.4 },
    ]);
  });

  it("keeps a name flag while the player is still in the match", () => {
    const flag = { playerId: 1, field: "PLAYER_NAME", value: "Mark", confidence: 0.3 };

    expect(collectImportFlags([{ matches: [match([flag])] }])).toHaveLength(1);
  });

  it("drops a flag the admin already fixed in the form", () => {
    const flag = { playerId: 1, field: "MK8_POS", value: "7", confidence: 0.4 };

    expect(collectImportFlags([{ matches: [match([flag], "1")] }])).toEqual([]);
  });

  it("treats a reformatted number as unchanged", () => {
    const flag = { playerId: 1, field: "MK8_POS", value: "02", confidence: 0.4 };

    expect(collectImportFlags([{ matches: [match([flag], "2")] }])[0]?.readValue).toBe("2");
  });

  it("drops a flag whose player was removed from the match, and duplicates", () => {
    const gone = { playerId: 9, field: "PLAYER_NAME", value: "Rando", confidence: 0.2 };
    const flag = { playerId: 1, field: "MK8_POS", value: "2", confidence: 0.4 };

    expect(collectImportFlags([{ matches: [match([gone, flag, flag])] }])).toHaveLength(1);
  });
});
