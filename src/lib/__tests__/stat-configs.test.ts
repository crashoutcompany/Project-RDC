import { isLowerBetter, STAT_CONFIGS, statRollup } from "@/lib/stat-configs";

describe("statRollup", () => {
  it("averages position stats and sums counting stats by default", () => {
    expect(statRollup(STAT_CONFIGS.mk8_place)).toBe("average");
    expect(statRollup(STAT_CONFIGS.cod_kills)).toBe("sum");
  });

  it("averages percentages and skips per-day counters", () => {
    expect(statRollup(STAT_CONFIGS.mr_accuracy)).toBe("average");
    expect(statRollup(STAT_CONFIGS.mk8_day)).toBe("skip");
    expect(statRollup(STAT_CONFIGS.rl_day)).toBe("skip");
  });
});

describe("isLowerBetter", () => {
  it("treats positions and deaths as lower-is-better", () => {
    expect(isLowerBetter(STAT_CONFIGS.cod_pos)).toBe(true);
    for (const key of ["cod_deaths", "lc_deaths", "mr_deaths"])
      expect(isLowerBetter(STAT_CONFIGS[key])).toBe(true);
  });

  it("treats other stats as higher-is-better", () => {
    expect(isLowerBetter(STAT_CONFIGS.cod_kills)).toBe(false);
    expect(isLowerBetter(STAT_CONFIGS.mr_accuracy)).toBe(false);
  });
});
