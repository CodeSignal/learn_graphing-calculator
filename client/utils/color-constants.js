/**
 * Color Constants
 * Programmatic color generation for graph expressions and assignments.
 * Uses golden-angle hue distribution for perceptually distinct colors.
 */

/**
 * Converts HSL to hex.
 * @param {number} h - Hue 0–360
 * @param {number} s - Saturation 0–100
 * @param {number} l - Lightness 0–100
 * @returns {string} Hex color (e.g. '#4A90E2')
 */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Golden angle in degrees (~137.5°) for perceptually even hue spacing */
const GOLDEN_ANGLE = 137.5;

/**
 * Returns a distinct color for any expression index.
 * Uses golden-angle hue distribution for virtually unlimited distinct colors.
 * @param {number} index - Non-negative expression index
 * @returns {string} Hex color
 */
export function getColorForIndex(index) {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return hslToHex(hue, 70, 55);
}
