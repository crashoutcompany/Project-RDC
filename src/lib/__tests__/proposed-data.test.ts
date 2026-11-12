import { parseProposedData } from "../proposed-data";

describe("parseProposedData", () => {
  const value = { proposedData: { sessionName: "A" }, dirtyFields: {} };

  it("returns an object stored in the Json column as is", () => {
    expect(parseProposedData(value)).toEqual(value);
  });

  it("parses legacy rows that stored a JSON string", () => {
    expect(parseProposedData(JSON.stringify(value))).toEqual(value);
  });
});
