// city/roads.js — JOB: the street grid: tile kinds, where the roads and blocks fall, the tile map, nearest intersection, and kerb points beside a block.
// EXPORTS: T_ROAD, T_BLOCK, T_PARK, T_SAND, T_WATER, BLOCKS_X, BLOCKS_Y, roadCenter, blockStart, BLOCK_SIZE, ROADS_X, ROADS_Y, layTiles, nearestNode, kerbPoint
// MUST NOT: place buildings, trees or named places (city/blocks.js), or answer collision queries (city/collide.js).
import { WORLD } from '../config.js';

export const T_ROAD = 1, T_BLOCK = 2, T_PARK = 3, T_SAND = 4, T_WATER = 5;

const { tile: T, tiles: N, period: P } = WORLD;
export const BLOCKS_X = 8;    // city blocks west of the beach
export const BLOCKS_Y = 10;

/** Pixel centre of the road numbered k (both axes use the same spacing). */
export const roadCenter = (k) => (P * k + 1) * T;
/** Block k's near edge in pixels. */
export const blockStart = (k) => (P * k + 2) * T;
export const BLOCK_SIZE = (P - 2) * T;
export const ROADS_X = BLOCKS_X + 1;  // vertical roads 0..8
export const ROADS_Y = BLOCKS_Y;      // horizontal roads 0..9

/** Fill city.tiles: roads every 6 tiles west of the beach, then sand, then water. */
export function layTiles(city) {
  city.tiles = new Uint8Array(N * N);
  for (let ty = 0; ty < N; ty += 1) {
    for (let tx = 0; tx < N; tx += 1) {
      let t = T_BLOCK;
      if (tx >= WORLD.waterCol) t = T_WATER;
      else if (tx >= WORLD.beachCol) t = T_SAND;
      else if (tx % P < 2 || ty % P < 2) t = T_ROAD;
      city.tiles[ty * N + tx] = t;
    }
  }
}

/** Nearest road intersection index to a point. */
export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(ROADS_X - 1, Math.round(x / T / P - 1 / P)));
  const j = Math.max(0, Math.min(ROADS_Y - 1, Math.round(y / T / P - 1 / P)));
  return { i, j, x: roadCenter(i), y: roadCenter(j) };
}

/** A point on the sidewalk of block (bi, bj), mid-way along one side: used for named places. */
export function kerbPoint(bi, bj, side) {
  const x0 = blockStart(bi), y0 = blockStart(bj), mid = BLOCK_SIZE / 2, k = WORLD.sidewalk / 2;
  if (side === 'n') return { x: x0 + mid, y: y0 + k, side };
  if (side === 's') return { x: x0 + mid, y: y0 + BLOCK_SIZE - k, side };
  if (side === 'w') return { x: x0 + k, y: y0 + mid, side };
  return { x: x0 + BLOCK_SIZE - k, y: y0 + mid, side };
}
