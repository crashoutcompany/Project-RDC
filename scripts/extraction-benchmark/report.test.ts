import { decide, verdictFor, type MethodSummary } from "./report";

const summary = (method: string, accuracy: number, extra: Partial<MethodSummary> = {}): MethodSummary =>
  ({ method, accuracy, invented: 0, costPerScoreboard: 0.01, ...extra }) as MethodSummary;

const azure = summary("azure", 0.94, { costPerScoreboard: 0.03 });

test("without Azure, only datasets with a saved baseline get a verdict", () => {
  expect(verdictFor(summary("a", 0.95), [], "rl-session33")).toBe("pivot");
  expect(verdictFor(summary("a", 0.95), [], "mk8-session41")).toBeNull();
  expect(decide([summary("a", 0.95)], "mk8-session41")).toMatch(/No Azure baseline/);
});

