/**
 * Placement of the on-curve hover readout (`id: (x, y)`).
 *
 * function-plot 1.24.4 (`dist/tip.js`) appends the readout as a left-anchored
 * `<text>` with a fixed `translate(5,-5)` from the hovered point and never
 * flips it. The tip group is clipped to the plot area, so near the right or
 * top edge (and in narrow panels) part of the readout is cut off.
 *
 * `computeTipLabelPlacement()` is the pure geometry: it keeps the readout
 * inside the plot area, preferring function-plot's own spot. `layoutTipLabel()`
 * measures the text and applies the result after function-plot has positioned
 * the tip; in very narrow plots it also wraps `id: (x, y)` onto two lines.
 */

/** function-plot's own gap between the point and the readout (`translate(5,-5)`). */
export const TIP_LABEL_OFFSET = 5;
/** Minimum gap kept between the readout and the plot-area edges, in px. */
export const TIP_LABEL_EDGE_PADDING = 4;
/** The readout is only shrunk to fit a narrow plot down to this font size. */
export const TIP_LABEL_MIN_FONT_SIZE = 12;
/** Line spacing of the two-line (wrapped) readout. */
export const TIP_LABEL_LINE_HEIGHT_EM = 1.2;

const SVG_NS = 'http://www.w3.org/2000/svg';
const WRAP_LINE_CLASS = 'tip-label-line';
const WRAP_SEPARATOR = ': ';

// Used only when the browser cannot measure the text (e.g. jsdom).
const FALLBACK_FONT_SIZE = 16;
const FALLBACK_CHAR_WIDTH_EM = 0.6;
const FALLBACK_ASCENT_EM = 1;
const FALLBACK_HEIGHT_EM = 1.25;
const FIT_EPSILON = 0.5;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Decide where the readout goes, relative to the hovered point.
 *
 * Candidates, first match wins (fully inside the plot and clear of every
 * obstacle; failing that, the first one fully inside the plot):
 * 1. right of and above the point (function-plot's default)
 * 2. left of and above (right edge)
 * 3. right of and below (top edge)
 * 4. left of and below (top-right corner)
 * then slid along the edge when neither side fits horizontally and/or
 * vertically (left edge, bottom edge, tiny plots). A readout wider than the
 * plot is first shrunk, down to `minFontSize`.
 *
 * All coordinates are plot-area pixels: (0, 0) is the top-left corner of the
 * clipped plot area, y grows downward.
 *
 * @param {Object} params
 * @param {number} params.pointX - Hovered point x (tip group translate x)
 * @param {number} params.pointY - Hovered point y (tip group translate y)
 * @param {number} params.plotWidth - Plot-area width (function-plot `meta.width`)
 * @param {number} params.plotHeight - Plot-area height (function-plot `meta.height`)
 * @param {number} params.textWidth - Readout width at `fontSize`
 * @param {number} params.textHeight - Readout height at `fontSize`
 * @param {number} params.textAscent - First baseline-to-top distance at `fontSize`
 * @param {number} [params.textLineOffset] - First-to-last baseline distance at
 *   `fontSize` (0 for one line), so "above" keeps the last line above the point
 * @param {number} [params.fontSize] - Font size the text was measured at
 * @param {Array<{left:number, top:number, right:number, bottom:number}>} [params.obstacles]
 *   Areas covered by HTML overlays (e.g. the zoom toolbar), in plot-area px
 * @returns {{anchor: 'start'|'end', dx: number, dy: number, fontSize: number,
 *   scaled: boolean, placement: string, fits: boolean}}
 *   `anchor`/`dx`/`dy` become `text-anchor` and `translate(dx,dy)` on the text.
 */
export function computeTipLabelPlacement({
  pointX,
  pointY,
  plotWidth,
  plotHeight,
  textWidth,
  textHeight,
  textAscent,
  textLineOffset = 0,
  fontSize = FALLBACK_FONT_SIZE,
  obstacles = [],
  offset = TIP_LABEL_OFFSET,
  padding = TIP_LABEL_EDGE_PADDING,
  minFontSize = TIP_LABEL_MIN_FONT_SIZE
}) {
  const baseFont = finiteOr(fontSize, FALLBACK_FONT_SIZE);
  const defaultPlacement = {
    anchor: 'start',
    dx: offset,
    dy: -offset,
    fontSize: baseFont,
    scaled: false,
    placement: 'right-above',
    fits: false
  };

  if (![pointX, pointY, plotWidth, plotHeight].every(Number.isFinite) ||
    plotWidth <= 0 || plotHeight <= 0) {
    return defaultPlacement;
  }

  let width = Math.max(0, finiteOr(textWidth, 0));
  let height = Math.max(0, finiteOr(textHeight, 0));
  let ascent = clamp(finiteOr(textAscent, height), 0, height);
  let lineOffset = clamp(finiteOr(textLineOffset, 0), 0, height);

  // Shrink a readout that is wider than the whole plot (narrow panels).
  let font = baseFont;
  const availableWidth = plotWidth - (2 * padding);
  if (width > availableWidth && availableWidth > 0 && width > 0) {
    const fitted = Math.floor((baseFont * availableWidth / width) * 2) / 2;
    font = Math.max(Math.min(minFontSize, baseFont), fitted);
    const scale = font / baseFont;
    width *= scale;
    height *= scale;
    ascent *= scale;
    lineOffset *= scale;
  }

  const minLeft = padding;
  const maxLeft = Math.max(padding, plotWidth - padding - width);
  const minTop = padding;
  const maxTop = Math.max(padding, plotHeight - padding - height);

  const horizontal = [
    { side: 'right', anchor: 'start', dx: offset },
    { side: 'left', anchor: 'end', dx: -offset },
    {
      side: 'slid',
      anchor: 'start',
      dx: clamp(pointX + offset, minLeft, maxLeft) - pointX
    }
  ];
  const aboveDy = -offset - lineOffset;
  const vertical = [
    { side: 'above', dy: aboveDy },
    { side: 'below', dy: offset + ascent },
    {
      side: 'slid',
      dy: clamp(pointY + aboveDy - ascent, minTop, maxTop) + ascent - pointY
    }
  ];

  const boxFor = (h, v) => {
    const anchorX = pointX + h.dx;
    const left = h.anchor === 'end' ? anchorX - width : anchorX;
    const top = pointY + v.dy - ascent;
    return { left, top, right: left + width, bottom: top + height };
  };
  const insidePlot = (box) => box.left >= padding - FIT_EPSILON &&
    box.right <= plotWidth - padding + FIT_EPSILON &&
    box.top >= padding - FIT_EPSILON &&
    box.bottom <= plotHeight - padding + FIT_EPSILON;
  const validObstacles = (Array.isArray(obstacles) ? obstacles : []).filter((o) => o &&
    [o.left, o.top, o.right, o.bottom].every(Number.isFinite) &&
    o.right > o.left && o.bottom > o.top);
  const clearOfObstacles = (box) => validObstacles.every((o) => box.right <= o.left ||
    box.left >= o.right || box.bottom <= o.top || box.top >= o.bottom);

  // Priority: both sides of the point above it, then below it, then slid.
  const order = [
    [0, 0], [1, 0], [0, 1], [1, 1],
    [2, 0], [2, 1], [0, 2], [1, 2], [2, 2]
  ];
  let firstInside = null;
  let chosen = null;
  for (const [hi, vi] of order) {
    const h = horizontal[hi];
    const v = vertical[vi];
    const box = boxFor(h, v);
    if (!insidePlot(box)) continue;
    if (clearOfObstacles(box)) {
      chosen = { h, v, fits: true };
      break;
    }
    if (!firstInside) firstInside = { h, v, fits: true };
  }
  if (!chosen) {
    chosen = firstInside || { h: horizontal[2], v: vertical[2], fits: false };
  }

  return {
    anchor: chosen.h.anchor,
    dx: round(chosen.h.dx),
    dy: round(chosen.v.dy),
    fontSize: font,
    scaled: font !== baseFont,
    placement: `${chosen.h.side}-${chosen.v.side}`,
    fits: chosen.fits
  };
}

/**
 * Parse the `translate(x,y)` function-plot writes on the tip group.
 * @param {string|null} transform
 * @returns {{x: number, y: number}|null}
 */
export function parseTranslate(transform) {
  if (typeof transform !== 'string') return null;
  const match = transform.match(/translate\(\s*([-+0-9.eE]+)(?:\s*[,\s]\s*([-+0-9.eE]+))?\s*\)/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = match[2] === undefined ? 0 : Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function getFontSize(textElement) {
  try {
    const view = textElement.ownerDocument?.defaultView;
    const size = parseFloat(view?.getComputedStyle(textElement).fontSize);
    if (Number.isFinite(size) && size > 0) return size;
  } catch (error) {
    // fall through to the default
  }
  return FALLBACK_FONT_SIZE;
}

function getWrappedLines(textElement) {
  if (!textElement?.querySelectorAll) return [];
  return Array.from(textElement.querySelectorAll(`tspan.${WRAP_LINE_CLASS}`));
}

/**
 * Measure the readout text at its current (stylesheet) font size.
 * Uses `getBBox()`, then `getComputedTextLength()` for the width, and falls
 * back to a character-count estimate where the browser cannot measure
 * (jsdom, detached or not-yet-rendered nodes). Handles the wrapped form.
 * @param {SVGTextElement} textElement
 * @returns {{width: number, height: number, ascent: number, fontSize: number,
 *   measured: boolean}}
 */
export function measureTipLabel(textElement) {
  const fontSize = getFontSize(textElement);
  const lineElements = getWrappedLines(textElement);
  const lines = lineElements.length > 0
    ? lineElements.map((line) => line.textContent || '')
    : [textElement?.textContent || ''];
  const longest = Math.max(...lines.map((line) => line.length));
  const estimate = {
    width: longest * fontSize * FALLBACK_CHAR_WIDTH_EM,
    height: (fontSize * FALLBACK_HEIGHT_EM) +
      ((lines.length - 1) * fontSize * TIP_LABEL_LINE_HEIGHT_EM),
    ascent: fontSize * FALLBACK_ASCENT_EM,
    fontSize,
    measured: false
  };

  try {
    if (typeof textElement?.getBBox === 'function') {
      // getBBox ignores the element's own transform, so y is relative to the
      // baseline: -y is the ascent.
      const box = textElement.getBBox();
      if (box && box.width > 0 && box.height > 0) {
        return {
          width: box.width,
          height: box.height,
          ascent: clamp(-box.y, 0, box.height),
          fontSize,
          measured: true
        };
      }
    }
  } catch (error) {
    // Firefox throws for unrendered text; use the next strategy
  }

  try {
    const measurable = lineElements.length > 0 ? lineElements : [textElement];
    if (measurable.every((el) => typeof el?.getComputedTextLength === 'function')) {
      const length = Math.max(...measurable.map((el) => el.getComputedTextLength()));
      if (Number.isFinite(length) && length > 0) {
        return { ...estimate, width: length, measured: true };
      }
    }
  } catch (error) {
    // use the estimate
  }

  return estimate;
}

/**
 * Split `id: (x, y)` into two lines (`id:` / `(x, y)`) using tspans.
 * function-plot rewrites the text with `.text()` on every move, which drops
 * the tspans again.
 * @param {SVGTextElement} textElement
 * @returns {boolean} false when the text has no `': '` to split at
 */
export function wrapTipLabel(textElement) {
  if (!textElement || getWrappedLines(textElement).length > 0) return false;
  const content = textElement.textContent || '';
  const split = content.indexOf(WRAP_SEPARATOR);
  if (split <= 0 || split + WRAP_SEPARATOR.length >= content.length) return false;

  const doc = textElement.ownerDocument;
  const parts = [
    content.slice(0, split + WRAP_SEPARATOR.length - 1),
    content.slice(split + WRAP_SEPARATOR.length)
  ];
  textElement.textContent = '';
  parts.forEach((part, index) => {
    const line = doc.createElementNS(SVG_NS, 'tspan');
    line.setAttribute('class', WRAP_LINE_CLASS);
    line.setAttribute('x', '0');
    if (index > 0) {
      line.setAttribute('dy', `${TIP_LABEL_LINE_HEIGHT_EM}em`);
    }
    line.textContent = part;
    textElement.appendChild(line);
  });
  return true;
}

/**
 * Undo `wrapTipLabel()`, restoring the single-line text node.
 * @param {SVGTextElement} textElement
 */
export function unwrapTipLabel(textElement) {
  const lines = getWrappedLines(textElement);
  if (lines.length === 0) return;
  textElement.textContent = lines.map((line) => line.textContent).join(' ');
}

/**
 * Measure, place and apply the readout for one tip position: one line first
 * (shrunk down to the minimum font size if needed), then two lines when one
 * line cannot fit the plot width.
 * @param {SVGTextElement} textElement - function-plot's tip `<text>`
 * @param {Object} geometry - `pointX`, `pointY`, `plotWidth`, `plotHeight`,
 *   `obstacles`, as for `computeTipLabelPlacement()`
 * @returns {(ReturnType<typeof computeTipLabelPlacement> & {lines: number})|null}
 */
export function layoutTipLabel(textElement, geometry) {
  if (!textElement || !textElement.textContent) return null;

  unwrapTipLabel(textElement);
  resetTipLabelFontSize(textElement);

  const placeAsMeasured = () => {
    const size = measureTipLabel(textElement);
    const extraLines = Math.max(0, getWrappedLines(textElement).length - 1);
    return computeTipLabelPlacement({
      ...geometry,
      textWidth: size.width,
      textHeight: size.height,
      textAscent: size.ascent,
      textLineOffset: extraLines * TIP_LABEL_LINE_HEIGHT_EM * size.fontSize,
      fontSize: size.fontSize
    });
  };

  let placement = { ...placeAsMeasured(), lines: 1 };
  if (!placement.fits && wrapTipLabel(textElement)) {
    // narrower even when it does not fully fit either
    placement = { ...placeAsMeasured(), lines: 2 };
  }

  applyTipLabelPlacement(textElement, placement);
  return placement;
}

/**
 * Write a placement onto the readout `<text>`. The default placement leaves
 * the element exactly as function-plot creates it.
 * @param {SVGTextElement} textElement
 * @param {ReturnType<typeof computeTipLabelPlacement>} placement
 */
export function applyTipLabelPlacement(textElement, placement) {
  if (!textElement || !placement) return;

  if (placement.anchor === 'end') {
    textElement.setAttribute('text-anchor', 'end');
  } else {
    textElement.removeAttribute('text-anchor');
  }
  textElement.setAttribute('transform', `translate(${placement.dx},${placement.dy})`);

  if (placement.scaled) {
    // app.css sizes `.tip text` with !important, so the override needs it too
    textElement.style.setProperty('font-size', `${placement.fontSize}px`, 'important');
  } else {
    textElement.style.removeProperty('font-size');
  }
}

/**
 * Drop a previous shrink so the next measurement sees the stylesheet size.
 * @param {SVGTextElement} textElement
 */
export function resetTipLabelFontSize(textElement) {
  textElement?.style?.removeProperty('font-size');
}
