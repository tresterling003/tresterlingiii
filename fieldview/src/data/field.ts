// High-school (NFHS) field geometry, in yards.
export const FIELD_WIDTH = 160 / 3; // 53 1/3 yards
export const HALF_WIDTH = FIELD_WIDTH / 2;
/** NFHS hash marks are 53'4" from each sideline (they divide the field into thirds). */
export const HASH_FROM_SIDELINE = 160 / 9; // 17.78 yd
export const HASH_OFFSET = HALF_WIDTH - HASH_FROM_SIDELINE; // 8.89 yd from center
/** Tops of the yard-line numbers are 9 yards from the sideline (when used). */
export const NUMBERS_TOP_FROM_SIDELINE = 9;
export const NUMBER_HEIGHT = 2; // 6 ft
export const END_ZONE = 10;

export type Hash = 'L' | 'M' | 'R';

/** x of the field's center line relative to the ball (defense's view; + = defense's right). */
export function fieldCenterX(hash: Hash): number {
  return hash === 'L' ? HASH_OFFSET : hash === 'R' ? -HASH_OFFSET : 0;
}

/** Distance from the ball to the sideline on a side (+1 = defense's right). */
export function sidelineDistance(hash: Hash, sign: 1 | -1): number {
  return sign * fieldCenterX(hash) + HALF_WIDTH;
}
