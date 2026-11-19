import { hasChanges, parseProposedData } from "../proposed-data";

describe("parseProposedData", () => {
  const value = { proposedData: { sessionName: "A" }, dirtyFields: {} };

  it("returns an object stored in the Json column as is", () => {
    expect(parseProposedData(value)).toEqual(value);
  });

  it("parses legacy rows that stored a JSON string", () => {
    expect(parseProposedData(JSON.stringify(value))).toEqual(value);
  });
});

describe("hasChanges", () => {
  it.each([
    ["a changed field", true],
    ["a changed field inside an object", { sessionName: true }],
    ["one changed stat deep in an otherwise untouched tree", {
      sessionName: false,
      sets: [{ setId: false, matches: [{ playerSessions: [{ playerStats: [{ statValue: true }] }] }] }],
    }],
  ])("is true for %s", (_label, dirty) => {
    expect(hasChanges(dirty)).toBe(true);
  });

  it.each([
    ["nothing", undefined],
    ["an untouched field", false],
    ["an empty tree", {}],
    ["an empty list", []],
    // What the form reports for sets nobody touched, after any field-array operation.
    ["a tree of untouched fields", { sets: [{ setId: false, setWinners: [{ playerId: false }] }] }],
  ])("is false for %s", (_label, dirty) => {
    expect(hasChanges(dirty)).toBe(false);
  });
});
