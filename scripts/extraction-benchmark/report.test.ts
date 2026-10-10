import { decide, verdictFor, type MethodSummary } from "./report";

const summary = (method: string, accuracy: number, extra: Partial<MethodSummary> = {}): MethodSummary =>
  ({ method, accuracy, invented: 0, costPerScoreboard: 0.01, ...extra }) as MethodSummary;

const azure = summary("azure", 0.94, { costPerScoreboard: 0.03 });

test("verdicts compare against Azure from the same run", () => {
  const all = [azure];
  expect(verdictFor(summary("a", 0.95), all, "any")).toBe("pivot");
  expect(verdictFor(summary("b", 0.92), all, "any")).toBe("new-games");
  expect(verdictFor(summary("c", 0.9), all, "any")).toBe("keep-azure");
  // Matching Azure isn't enough if it costs more.
  expect(verdictFor(summary("d", 0.95, { costPerScoreboard: 0.05 }), all, "any")).toBe("new-games");
  // Any invented player disqualifies.
  expect(verdictFor(summary("e", 1, { invented: 1 }), all, "any")).toBe("keep-azure");
});

test("without Azure, only datasets with a saved baseline get a verdict", () => {
  expect(verdictFor(summary("a", 0.95), [], "rl-session33")).toBe("pivot");
  expect(verdictFor(summary("a", 0.95), [], "mk8-session41")).toBeNull();
  expect(decide([summary("a", 0.95)], "mk8-session41")).toMatch(/No Azure baseline/);
});

test("decide names the most accurate LLM", () => {
  expect(decide([azure, summary("a", 0.91), summary("b", 0.96)], "any")).toMatch(/^Pivot candidate: b/);
});
