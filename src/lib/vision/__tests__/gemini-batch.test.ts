import { afterEach, describe, expect, it, vi } from "vitest";
import { readWithGeminiBatch } from "../gemini-batch";

const answer = {
  players: [{ gamertag: "Dpatel254", member: "Dylan", team: null, stats: { mk8_place: 1 } }],
  winning_team: null,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe("readWithGeminiBatch", () => {
  it("submits, polls until done (BATCH_STATE_* as the API reports it), and parses each result", async () => {
    const polls = [
      { metadata: { state: "BATCH_STATE_RUNNING" } },
      {
        metadata: {
          state: "BATCH_STATE_SUCCEEDED",
          output: {
            inlinedResponses: {
              inlinedResponses: [
                { response: { candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: JSON.stringify(answer) }] } }] } },
                { error: { message: "blocked" } },
              ],
            },
          },
        },
      },
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
      init?.method === "POST" ? json({ name: "batches/abc" }) : json(polls.shift()),
    );

    const results = await readWithGeminiBatch(
      [
        { key: "a", gameId: 1, base64Source: "iVBORw0KGgo=" },
        { key: "b", gameId: 1, base64Source: "iVBORw0KGgo=" },
      ],
      { apiKey: "test", pollMs: 0, log: () => {} },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.get("a")).toHaveProperty("fields");
    expect(results.get("b")).toEqual({ error: "blocked" });
  });

  it("marks every item failed when the job expires", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) =>
      init?.method === "POST" ? json({ name: "batches/abc" }) : json({ metadata: { state: "BATCH_STATE_EXPIRED" } }),
    );
    const results = await readWithGeminiBatch([{ key: "a", gameId: 1, base64Source: "iVBORw0KGgo=" }], {
      apiKey: "test",
      pollMs: 0,
      log: () => {},
    });
    expect(results.get("a")).toEqual({ error: "batch JOB_STATE_EXPIRED" });
  });

  it("fails items for games Gemini has no spec for without submitting them", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const results = await readWithGeminiBatch([{ key: "a", gameId: 999, base64Source: "x" }], { apiKey: "test" });
    expect(results.get("a")).toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
