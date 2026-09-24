import sharp from "sharp";

/** Black gutter between tiles so the model doesn't read two frames as one screen. */
const GUTTER_PX = 6;
const TILE_ASPECT = 16 / 9;

export interface TileRect {
  /** 1-based label drawn on the tile and used in the model's response. */
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  tiles: TileRect[];
}

/**
 * Lays `count` 16:9 tiles out left-to-right, top-to-bottom on a `grid`-wide
 * sheet. A partial last sheet keeps the full column count (so tiles stay the
 * same size the model saw on full sheets) but drops empty rows.
 *
 * @param count - Frames on this sheet (1..grid²).
 * @param grid - Tiles per row.
 * @param sheetWidth - Target sheet width in pixels.
 * @returns Sheet size and one rect per tile.
 */
export function sheetLayout(
  count: number,
  grid: number,
  sheetWidth: number,
): SheetLayout {
  const tileWidth = Math.floor((sheetWidth - GUTTER_PX * (grid - 1)) / grid);
  const tileHeight = Math.round(tileWidth / TILE_ASPECT);
  const rows = Math.ceil(count / grid);

  const tiles = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    left: (i % grid) * (tileWidth + GUTTER_PX),
    top: Math.floor(i / grid) * (tileHeight + GUTTER_PX),
    width: tileWidth,
    height: tileHeight,
  }));

  return {
    width: grid * tileWidth + GUTTER_PX * (grid - 1),
    height: rows * tileHeight + GUTTER_PX * (rows - 1),
    tiles,
  };
}

/** Big high-contrast tile number in the top-left corner. */
function labelSvg(index: number, tileHeight: number): Buffer {
  const size = Math.max(18, Math.round(tileHeight * 0.16));
  const pad = Math.round(size * 0.3);
  const boxW = Math.round(size * (String(index).length * 0.62 + 0.5));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW + pad}" height="${size + pad * 2}">` +
      `<rect x="0" y="0" width="${boxW + pad}" height="${size + pad * 2}" fill="#ffeb3b"/>` +
      `<text x="${(boxW + pad) / 2}" y="${size + pad * 0.6}" font-family="sans-serif" ` +
      `font-weight="bold" font-size="${size}" fill="#000" text-anchor="middle">${index}</text>` +
      `</svg>`,
  );
}

/**
 * Tiles frames into one numbered JPEG so a vision model can classify several
 * frames per request. Tile N (1-based) is `framePaths[N - 1]`.
 *
 * @param framePaths - Frame images, in the order tiles should be numbered.
 * @param grid - Tiles per row.
 * @param sheetWidth - Target sheet width in pixels.
 * @returns The sheet as a JPEG buffer.
 */
export async function buildContactSheet(
  framePaths: string[],
  grid: number,
  sheetWidth: number,
): Promise<Buffer> {
  const layout = sheetLayout(framePaths.length, grid, sheetWidth);

  const composites = (
    await Promise.all(
      layout.tiles.map(async (tile, i) => {
        const image = await sharp(framePaths[i])
          .resize(tile.width, tile.height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0 },
          })
          .toBuffer();
        return [
          { input: image, left: tile.left, top: tile.top },
          {
            input: labelSvg(tile.index, tile.height),
            left: tile.left,
            top: tile.top,
          },
        ];
      }),
    )
  ).flat();

  return sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toBuffer();
}
