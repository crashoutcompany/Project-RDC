import { decide, evaluateHypotheses, PIVOT_ACCURACY, verdictFor, type MethodSummary } from "./report";

const summary = (method: string, accuracy: number, extra: Partial<MethodSummary> = {}): MethodSummary =>
  ({ method, accuracy, invented: 0, costPerScoreboard: 0.003, winnerExactPerPass: 13, ...extra }) as MethodSummary;

test("pivot needs the pre-registered accuracy and no invented players", () => {
  expect(verdictFor(summary("a", PIVOT_ACCURACY))).toBe("pivot");
  expect(verdictFor(summary("a", 0.97))).toBe("keep");
  expect(verdictFor(summary("a", 1, { invented: 1 }))).toBe("keep");
});

test("decide names the best reader and states the bar", () => {
  expect(decide([summary("a", 0.95), summary("b", 0.99)])).toMatch(/^Pivot candidate: b/);
  expect(decide([summary("a", 0.9)])).toMatch(/^Keep the current path/);
});

test("H1 needs every reader to clear the bar", () => {
  expect(evaluateHypotheses([summary("a", 0.99), summary("b", 0.97)], 13)[0]).toMatch(/not supported/);
  expect(evaluateHypotheses([summary("a", 0.99)], 13)[0]).toMatch(/supported —/);
});
