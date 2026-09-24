import { sheetLayout } from "./contact-sheet";

describe("sheetLayout", () => {
  it("numbers tiles left-to-right, top-to-bottom", () => {
    const layout = sheetLayout(9, 3, 1280);
    expect(layout.tiles.map((t) => t.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(layout.tiles[1].left).toBeGreaterThan(layout.tiles[0].left);
    expect(layout.tiles[3].left).toBe(0);
    expect(layout.tiles[3].top).toBeGreaterThan(0);
    expect(layout.width).toBeLessThanOrEqual(1280);
  });

  it("keeps full-sheet tile size on a partial last sheet but drops empty rows", () => {
    const full = sheetLayout(9, 3, 1280);
    const partial = sheetLayout(4, 3, 1280);
    expect(partial.tiles).toHaveLength(4);
    expect(partial.tiles[0].width).toBe(full.tiles[0].width);
    expect(partial.height).toBeLessThan(full.height);
    expect(partial.tiles[3]).toMatchObject({ left: 0, top: full.tiles[3].top });
  });

  it("uses one full-width tile for grid 1", () => {
    const layout = sheetLayout(1, 1, 1280);
    expect(layout.tiles[0]).toMatchObject({ left: 0, top: 0, width: 1280, height: 720 });
  });
});
