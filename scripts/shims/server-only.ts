// Stand-in for the `server-only` marker package when server modules are run
// from tsx CLIs (scripts/tsconfig.json maps it here). The real package throws
// unless resolved under the `react-server` condition, which only Next applies.
export {};
