/**
 * Jest setup - runs before each test file.
 * Mocks console methods to reduce noise in test output.
 */
const noop = () => {};

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(noop);
  jest.spyOn(console, "warn").mockImplementation(noop);
  jest.spyOn(console, "error").mockImplementation(noop);
  jest.spyOn(console, "info").mockImplementation(noop);
  jest.spyOn(console, "debug").mockImplementation(noop);
  jest.spyOn(console, "group").mockImplementation(noop);
  jest.spyOn(console, "groupEnd").mockImplementation(noop);
});

afterEach(() => {
  jest.restoreAllMocks();
});
