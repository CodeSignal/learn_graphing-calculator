import { describe, expect, it } from 'vitest'
import {
  TIP_LABEL_EDGE_PADDING,
  TIP_LABEL_MIN_FONT_SIZE,
  TIP_LABEL_OFFSET,
  applyTipLabelPlacement,
  computeTipLabelPlacement,
  layoutTipLabel,
  measureTipLabel,
  parseTranslate,
  unwrapTipLabel,
  wrapTipLabel
} from '../../../client/renderers/tip-label-placement.js'

// Roughly what Chrome measures for "regressionLine: (72.934, 178.759)" at 17px
const TEXT = { textWidth: 266, textHeight: 20, textAscent: 16, fontSize: 17 }
const WIDE = { plotWidth: 1077, plotHeight: 814 }

function place(overrides) {
  return computeTipLabelPlacement({ ...WIDE, ...TEXT, ...overrides })
}

// Box the text occupies, in plot-area px, for a placement result
function boxOf(result, { pointX, pointY, textWidth = TEXT.textWidth,
  textHeight = TEXT.textHeight, textAscent = TEXT.textAscent }) {
  const scale = result.fontSize / TEXT.fontSize
  const width = textWidth * scale
  const anchorX = pointX + result.dx
  const left = result.anchor === 'end' ? anchorX - width : anchorX
  const top = pointY + result.dy - (textAscent * scale)
  return { left, right: left + width, top, bottom: top + (textHeight * scale) }
}

function expectInside(box, plotWidth, plotHeight) {
  expect(box.left).toBeGreaterThanOrEqual(TIP_LABEL_EDGE_PADDING - 0.5)
  expect(box.right).toBeLessThanOrEqual(plotWidth - TIP_LABEL_EDGE_PADDING + 0.5)
  expect(box.top).toBeGreaterThanOrEqual(TIP_LABEL_EDGE_PADDING - 0.5)
  expect(box.bottom).toBeLessThanOrEqual(plotHeight - TIP_LABEL_EDGE_PADDING + 0.5)
}

describe('computeTipLabelPlacement', () => {
  it('leaves a readout that fits at function-plot\'s default spot unchanged', () => {
    const result = place({ pointX: 300, pointY: 400 })

    expect(result).toMatchObject({
      anchor: 'start',
      dx: TIP_LABEL_OFFSET,
      dy: -TIP_LABEL_OFFSET,
      fontSize: 17,
      scaled: false,
      placement: 'right-above',
      fits: true
    })
  })

  it('flips the readout to the left of the point near the right edge', () => {
    const pointX = 900 // 900 + 5 + 266 > 1077
    const result = place({ pointX, pointY: 400 })

    expect(result).toMatchObject({
      anchor: 'end',
      dx: -TIP_LABEL_OFFSET,
      dy: -TIP_LABEL_OFFSET,
      placement: 'left-above',
      scaled: false
    })
    const box = boxOf(result, { pointX, pointY: 400 })
    expect(box.right).toBe(pointX - TIP_LABEL_OFFSET)
    expectInside(box, WIDE.plotWidth, WIDE.plotHeight)
  })

  it('moves the readout below the point near the top edge', () => {
    const pointY = 12 // text top would be 12 - 5 - 16 < 0
    const result = place({ pointX: 300, pointY })

    expect(result).toMatchObject({
      anchor: 'start',
      dx: TIP_LABEL_OFFSET,
      dy: TIP_LABEL_OFFSET + TEXT.textAscent,
      placement: 'right-below'
    })
    const box = boxOf(result, { pointX: 300, pointY })
    expect(box.top).toBe(pointY + TIP_LABEL_OFFSET)
    expectInside(box, WIDE.plotWidth, WIDE.plotHeight)
  })

  it('goes left and below in the top-right corner', () => {
    const result = place({ pointX: 1070, pointY: 3 })

    expect(result.placement).toBe('left-below')
    expect(result.anchor).toBe('end')
    expectInside(boxOf(result, { pointX: 1070, pointY: 3 }), WIDE.plotWidth, WIDE.plotHeight)
  })

  it('keeps the readout off the bottom edge when the point is clamped below the plot', () => {
    // function-plot clamps an off-screen point to height + 20
    const pointY = WIDE.plotHeight + 20
    const result = place({ pointX: 300, pointY })

    expect(result.anchor).toBe('start')
    const box = boxOf(result, { pointX: 300, pointY })
    expect(box.bottom).toBeCloseTo(WIDE.plotHeight - TIP_LABEL_EDGE_PADDING, 5)
    expectInside(box, WIDE.plotWidth, WIDE.plotHeight)
  })

  it('slides the readout along the left edge when neither side of the point has room', () => {
    // 300px plot: 266px text fits nowhere beside a point at x = 150
    const plot = { plotWidth: 300, plotHeight: 600 }
    const result = place({ ...plot, pointX: 150, pointY: 300 })

    expect(result.placement).toBe('slid-above')
    expect(result.scaled).toBe(false)
    const box = boxOf(result, { pointX: 150, pointY: 300 })
    expect(box.right).toBeCloseTo(plot.plotWidth - TIP_LABEL_EDGE_PADDING, 5)
    expectInside(box, plot.plotWidth, plot.plotHeight)
  })

  it('shrinks a readout that is wider than the whole plot (split-screen panel)', () => {
    const plot = { plotWidth: 257, plotHeight: 864 } // 620px-wide panel with the sidebar open
    const result = place({ ...plot, pointX: 150, pointY: 270 })

    expect(result.scaled).toBe(true)
    expect(result.fontSize).toBeLessThan(17)
    expect(result.fontSize).toBeGreaterThanOrEqual(TIP_LABEL_MIN_FONT_SIZE)
    expect(result.fits).toBe(true)
    expectInside(boxOf(result, { pointX: 150, pointY: 270 }), plot.plotWidth, plot.plotHeight)
  })

  it('does not shrink below the minimum font size', () => {
    const result = place({ plotWidth: 120, plotHeight: 400, pointX: 60, pointY: 200 })

    expect(result.fontSize).toBe(TIP_LABEL_MIN_FONT_SIZE)
    expect(result.fits).toBe(false)
    // best effort: starts at the left padding
    expect(boxOf(result, { pointX: 60, pointY: 200 }).left).toBe(TIP_LABEL_EDGE_PADDING)
  })

  it('avoids overlay obstacles such as the zoom toolbar', () => {
    // toolbar over the top-right of the plot
    const toolbar = { left: 850, top: -4, right: 1090, bottom: 44 }
    const pointX = 950
    const pointY = 52 // left-above would put the text at y 31..51, under the toolbar
    const result = place({ pointX, pointY, obstacles: [toolbar] })

    expect(result.placement).toBe('left-below')
    const box = boxOf(result, { pointX, pointY })
    expect(box.top).toBeGreaterThanOrEqual(toolbar.bottom)
    expectInside(box, WIDE.plotWidth, WIDE.plotHeight)
  })

  it('ignores obstacles when every in-plot spot is covered', () => {
    const everywhere = { left: -100, top: -100, right: 2000, bottom: 2000 }
    const result = place({ pointX: 300, pointY: 400, obstacles: [everywhere] })

    expect(result.placement).toBe('right-above')
    expect(result.fits).toBe(true)
  })

  it('keeps the last line of a two-line readout above the point', () => {
    const lineOffset = 20 // 1.2em at 17px, rounded
    const result = place({
      pointX: 300, pointY: 400, textWidth: 140, textHeight: 40, textLineOffset: lineOffset
    })

    expect(result.placement).toBe('right-above')
    expect(result.dy).toBe(-TIP_LABEL_OFFSET - lineOffset)
    // and below the point near the top edge, first line right under it
    const below = place({
      pointX: 300, pointY: 20, textWidth: 140, textHeight: 40, textLineOffset: lineOffset
    })
    expect(below.placement).toBe('right-below')
    expect(below.dy).toBe(TIP_LABEL_OFFSET + TEXT.textAscent)
  })

  it('falls back to the default placement for unusable geometry', () => {
    const result = computeTipLabelPlacement({
      pointX: Number.NaN,
      pointY: 10,
      plotWidth: 0,
      plotHeight: 100,
      textWidth: 50,
      textHeight: 20,
      textAscent: 16
    })

    expect(result).toMatchObject({ anchor: 'start', dx: 5, dy: -5, scaled: false })
  })
})

describe('parseTranslate', () => {
  it('reads the translate function-plot writes on the tip group', () => {
    expect(parseTranslate('translate(150.00000000000006,269.92108461829775)'))
      .toEqual({ x: 150.00000000000006, y: 269.92108461829775 })
    expect(parseTranslate('translate(-3.5 1e2)')).toEqual({ x: -3.5, y: 100 })
    expect(parseTranslate('translate(7)')).toEqual({ x: 7, y: 0 })
  })

  it('returns null for missing or unparsable transforms', () => {
    expect(parseTranslate(null)).toBeNull()
    expect(parseTranslate('rotate(-90)')).toBeNull()
  })
})

describe('measureTipLabel', () => {
  function makeText(content) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = content
    return text
  }

  it('uses getBBox when the browser can measure', () => {
    const text = makeText('f: (1.000, 2.000)')
    text.getBBox = () => ({ x: -120, y: -15, width: 120, height: 19 })

    expect(measureTipLabel(text)).toMatchObject({
      width: 120,
      height: 19,
      ascent: 15,
      measured: true
    })
  })

  it('falls back to getComputedTextLength when getBBox is empty', () => {
    const text = makeText('f: (1.000, 2.000)')
    text.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
    text.getComputedTextLength = () => 101

    const size = measureTipLabel(text)
    expect(size.measured).toBe(true)
    expect(size.width).toBe(101)
    expect(size.height).toBeGreaterThan(0)
  })

  it('estimates from the character count when measuring is unavailable or throws', () => {
    const content = 'regressionLine: (72.934, 178.759)'
    const text = makeText(content)
    text.getBBox = () => { throw new Error('not rendered') }

    const size = measureTipLabel(text)
    expect(size.measured).toBe(false)
    expect(size.fontSize).toBeGreaterThan(0)
    expect(size.width).toBeCloseTo(content.length * size.fontSize * 0.6, 5)
    expect(size.ascent).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThanOrEqual(size.ascent)
  })

  it('estimates in jsdom, which has no SVG text measurement', () => {
    const text = makeText('abc')
    document.body.appendChild(text)

    expect(measureTipLabel(text).measured).toBe(false)
    expect(measureTipLabel(text).width).toBeGreaterThan(0)
    text.remove()
  })
})

describe('wrapTipLabel / unwrapTipLabel', () => {
  function makeText(content) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = content
    return text
  }

  it('splits "id: (x, y)" into two tspans and restores the exact text', () => {
    const content = 'regressionLine: (72.934, 178.759)'
    const text = makeText(content)

    expect(wrapTipLabel(text)).toBe(true)
    const lines = Array.from(text.querySelectorAll('tspan'))
    expect(lines.map((t) => t.textContent)).toEqual(['regressionLine:', '(72.934, 178.759)'])
    expect(lines.map((t) => t.getAttribute('x'))).toEqual(['0', '0'])
    expect(lines[1].getAttribute('dy')).toBe('1.2em')
    expect(wrapTipLabel(text)).toBe(false) // already wrapped

    unwrapTipLabel(text)
    expect(text.querySelectorAll('tspan')).toHaveLength(0)
    expect(text.textContent).toBe(content)
  })

  it('does not wrap text without an "id: " prefix', () => {
    const text = makeText('(1.000, 2.000)')
    expect(wrapTipLabel(text)).toBe(false)
    expect(text.textContent).toBe('(1.000, 2.000)')
  })
})

describe('layoutTipLabel', () => {
  const content = 'regressionLine: (72.934, 178.759)'

  function makeText() {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('transform', 'translate(5,-5)')
    text.textContent = content
    return text
  }

  it('keeps one line at function-plot\'s spot when it fits (estimated metrics)', () => {
    const text = makeText()
    const result = layoutTipLabel(text, { ...WIDE, pointX: 100, pointY: 300 })

    expect(result).toMatchObject({ lines: 1, placement: 'right-above', fits: true })
    expect(text.getAttribute('transform')).toBe('translate(5,-5)')
    expect(text.textContent).toBe(content)
  })

  it('wraps onto two lines in a plot too narrow for one line, then unwraps', () => {
    const text = makeText()
    const narrow = layoutTipLabel(text, {
      plotWidth: 140, plotHeight: 600, pointX: 70, pointY: 300
    })

    expect(narrow.lines).toBe(2)
    expect(narrow.fits).toBe(true)
    expect(text.querySelectorAll('tspan')).toHaveLength(2)

    const wide = layoutTipLabel(text, { ...WIDE, pointX: 100, pointY: 300 })
    expect(wide.lines).toBe(1)
    expect(text.querySelectorAll('tspan')).toHaveLength(0)
    expect(text.textContent).toBe(content)
    expect(text.style.getPropertyValue('font-size')).toBe('')
  })

  it('ignores an empty text element', () => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    expect(layoutTipLabel(text, { ...WIDE, pointX: 1, pointY: 1 })).toBeNull()
    expect(text.hasAttribute('transform')).toBe(false)
  })
})

describe('applyTipLabelPlacement', () => {
  it('writes anchor/transform/font-size and restores the default form', () => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('transform', 'translate(5,-5)')

    applyTipLabelPlacement(text, {
      anchor: 'end', dx: -5, dy: 21, fontSize: 15.5, scaled: true
    })
    expect(text.getAttribute('text-anchor')).toBe('end')
    expect(text.getAttribute('transform')).toBe('translate(-5,21)')
    expect(text.style.getPropertyValue('font-size')).toBe('15.5px')
    expect(text.style.getPropertyPriority('font-size')).toBe('important')

    applyTipLabelPlacement(text, {
      anchor: 'start', dx: 5, dy: -5, fontSize: 17, scaled: false
    })
    expect(text.hasAttribute('text-anchor')).toBe(false)
    expect(text.getAttribute('transform')).toBe('translate(5,-5)')
    expect(text.style.getPropertyValue('font-size')).toBe('')
  })
})
