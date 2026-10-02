import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FunctionPlotRenderer from '../../../client/renderers/function-plot-renderer.js'
import {
  TIP_LABEL_EDGE_PADDING,
  parseTranslate
} from '../../../client/renderers/tip-label-placement.js'

/**
 * Hovers the real function-plot 1.24.4 (no mock) in jsdom and checks that the
 * on-curve readout is re-placed inside the plot area after function-plot
 * positions it.
 */
describe('FunctionPlotRenderer hover readout placement (real function-plot)', () => {
  const VIEWPORT = { xMin: 60, xMax: 80, yMin: 110, yMax: 210 }
  const LINE_COLOR = '#3cdd6b'
  const line = (x) => -173.51 + (4.83 * x)
  const tipRenderer = (x, y) => `regressionLine: (${x.toFixed(3)}, ${y.toFixed(3)})`
  const data = [{
    fnType: 'linear',
    fn: '-173.51 + 4.83 * x',
    color: LINE_COLOR,
    attr: { 'stroke-width': 2.5 }
  }]

  let container
  let renderer
  let getContextSpy

  const innerTip = () => container.querySelector('.function-plot g.tip g.inner-tip')
  const tipText = () => innerTip().querySelector('text')

  function init(width = 800, height = 500) {
    renderer.init({
      width,
      height,
      viewport: VIEWPORT,
      showGrid: true,
      onZoom: vi.fn(),
      tipRenderer,
      xAxisLabel: 'Third-exam score',
      yAxisLabel: 'Final-exam score'
    })
    renderer.updateData(data)
  }

  // Real DOM mousemove on function-plot's zoom/drag rect. In jsdom d3.pointer
  // falls back to clientX/Y minus the (zero) bounding rect, i.e. plot-area px.
  function hover(dataX) {
    const { xScale, yScale } = renderer.chart.meta
    const rect = container.querySelector('.function-plot .zoom-and-drag')
    rect.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: xScale(dataX),
      clientY: yScale(line(dataX))
    }))
  }

  // Text box in plot-area px from the attributes we wrote, for a known width
  function textBox(width, height = 20, ascent = 16) {
    const point = parseTranslate(innerTip().getAttribute('transform'))
    const offset = parseTranslate(tipText().getAttribute('transform'))
    const fontSize = parseFloat(tipText().style.getPropertyValue('font-size'))
    const scale = Number.isFinite(fontSize) ? fontSize / 16 : 1
    const anchorX = point.x + offset.x
    const w = width * scale
    const left = tipText().getAttribute('text-anchor') === 'end' ? anchorX - w : anchorX
    const top = point.y + offset.y - (ascent * scale)
    return { left, right: left + w, top, bottom: top + (height * scale) }
  }

  function expectInsidePlot(box) {
    const { width, height } = renderer.chart.meta
    expect(box.left).toBeGreaterThanOrEqual(TIP_LABEL_EDGE_PADDING - 0.5)
    expect(box.right).toBeLessThanOrEqual(width - TIP_LABEL_EDGE_PADDING + 0.5)
    expect(box.top).toBeGreaterThanOrEqual(TIP_LABEL_EDGE_PADDING - 0.5)
    expect(box.bottom).toBeLessThanOrEqual(height - TIP_LABEL_EDGE_PADDING + 0.5)
  }

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'graph-canvas'
    document.body.appendChild(container)
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null)
    renderer = new FunctionPlotRenderer(container)
  })

  afterEach(() => {
    renderer.destroy()
    getContextSpy.mockRestore()
    delete SVGElement.prototype.getBBox
    document.body.innerHTML = ''
  })

  describe('with measurable text (getBBox)', () => {
    const CHAR_WIDTH = 8 // 33 chars -> 264px, like Chrome at 16-17px

    beforeEach(() => {
      // 16px text: 20px line box, 16px ascent; wrapped lines are 1.2em apart
      SVGElement.prototype.getBBox = function getBBox() {
        const tspans = Array.from(this.querySelectorAll('tspan'))
        const lines = tspans.length ? tspans.map((t) => t.textContent) : [this.textContent || '']
        const width = Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH
        const anchorEnd = this.getAttribute('text-anchor') === 'end'
        const height = 20 + ((lines.length - 1) * 19.2)
        return { x: anchorEnd ? -width : 0, y: -16, width, height }
      }
    })

    it('leaves the readout at function-plot\'s spot when it fits', () => {
      init()
      hover(62)

      expect(innerTip().style.display).not.toBe('none')
      expect(tipText().textContent).toBe(tipRenderer(62, line(62)))
      expect(tipText().getAttribute('transform')).toBe('translate(5,-5)')
      expect(tipText().hasAttribute('text-anchor')).toBe(false)
      expect(tipText().style.getPropertyValue('font-size')).toBe('')
    })

    it('flips the readout left of the point near the right edge, content/color intact', () => {
      init()
      hover(73)

      const text = tipText()
      expect(text.getAttribute('text-anchor')).toBe('end')
      expect(text.getAttribute('transform')).toBe('translate(-5,-5)')
      expect(text.textContent).toBe(tipRenderer(73, line(73)))
      expect(text.getAttribute('fill')).toBe(LINE_COLOR)
      expectInsidePlot(textBox(text.textContent.length * CHAR_WIDTH))

      // crosshair lines are untouched
      expect(innerTip().querySelector('.tip-x-line').style.display).not.toBe('none')
      expect(innerTip().querySelector('.tip-y-line').style.display).not.toBe('none')
    })

    it('moves the readout left and below near the top-right corner', () => {
      init()
      hover(79.35) // y ~ 209.8, just under the top of a 110..210 plot

      const text = tipText()
      expect(text.getAttribute('text-anchor')).toBe('end')
      const offset = parseTranslate(text.getAttribute('transform'))
      expect(offset.x).toBe(-5)
      expect(offset.y).toBeGreaterThan(0)
      expectInsidePlot(textBox(text.textContent.length * CHAR_WIDTH))
    })

    it('keeps the readout clear of [data-plot-overlay] elements (zoom toolbar)', () => {
      init()
      const { width, height, yScale } = renderer.chart.meta
      // jsdom has no layout: put the plot area at the client origin and a
      // toolbar over its top-right corner (like #graph-toolbar)
      container.querySelector('.function-plot .zoom-and-drag').getBoundingClientRect = () => ({
        left: 0, top: 0, right: width, bottom: height, width, height
      })
      const toolbar = document.createElement('div')
      toolbar.setAttribute('data-plot-overlay', '')
      toolbar.getBoundingClientRect = () => ({
        left: width - 240, top: -4, right: width + 20, bottom: 44, width: 260, height: 48
      })

      // line point 52px below the top, near the right edge
      const dataX = (yScale.invert(52) + 173.51) / 4.83
      hover(dataX)
      expect(tipText().getAttribute('transform')).toBe('translate(-5,-5)') // left-above

      document.body.appendChild(toolbar)
      hover(dataX)
      const text = tipText()
      expect(text.getAttribute('text-anchor')).toBe('end')
      const box = textBox(text.textContent.length * CHAR_WIDTH)
      expect(box.top).toBeGreaterThanOrEqual(44) // below the toolbar
      expectInsidePlot(box)
    })

    it('keeps re-placing after zoom/pan draws and rebuilds (resize, axis labels)', () => {
      init()
      hover(73)
      expect(tipText().getAttribute('text-anchor')).toBe('end')

      // wheel/drag zoom: function-plot rescales, redraws and re-emits mousemove
      renderer.chart.emit('all:zoom', {
        transform: {
          rescaleX: (scale) => scale.copy().domain([50, 90]),
          rescaleY: (scale) => scale.copy().domain([60, 260])
        }
      })
      hover(73) // now in the middle of the plot
      expect(tipText().getAttribute('transform')).toBe('translate(5,-5)')
      expect(tipText().hasAttribute('text-anchor')).toBe(false)

      // narrow split-screen rebuild with new axis labels
      renderer.rebuild({
        width: 300,
        height: 900,
        viewport: VIEWPORT,
        showGrid: true,
        xAxisLabel: 'Exam 3',
        yAxisLabel: 'Final'
      })
      hover(73)
      const text = tipText()
      expect(text.textContent).toBe(tipRenderer(73, line(73)))
      expect(container.querySelector('text.x.axis-label')?.textContent).toBe('Exam 3')
      // 264px of text in a 240px plot: shrunk to fit, then slid inside
      expect(text.style.getPropertyValue('font-size')).not.toBe('')
      expectInsidePlot(textBox(text.textContent.length * CHAR_WIDTH))

      // back to a wide plot: the shrink is dropped again
      renderer.rebuild({ width: 800, height: 500, viewport: VIEWPORT, showGrid: true })
      hover(62)
      expect(tipText().style.getPropertyValue('font-size')).toBe('')
      expect(tipText().getAttribute('transform')).toBe('translate(5,-5)')
    })

    it('wraps the readout onto two lines when one line cannot fit the plot', () => {
      // 180px panel -> 120px plot: 264px of text does not fit even at 12px
      init(180, 700)
      hover(73)

      const text = tipText()
      const lines = Array.from(text.querySelectorAll('tspan')).map((t) => t.textContent)
      const [x, y] = [73, line(73)]
      expect(lines).toEqual(['regressionLine:', `(${x.toFixed(3)}, ${y.toFixed(3)})`])
      expect(text.getAttribute('fill')).toBe(LINE_COLOR)

      // 17-char second line at <= 16px fits the 120px plot
      const fontSize = parseFloat(text.style.getPropertyValue('font-size')) || 16
      const scale = fontSize / 16
      const box = textBox(17 * CHAR_WIDTH, 20 + 19.2)
      expect(box.right - box.left).toBeCloseTo(17 * CHAR_WIDTH * scale, 5)
      expectInsidePlot(box)

      // a wide plot puts it back on one line at function-plot's spot
      renderer.rebuild({ width: 800, height: 500, viewport: VIEWPORT, showGrid: true })
      hover(62)
      expect(tipText().querySelectorAll('tspan')).toHaveLength(0)
      expect(tipText().textContent).toBe(tipRenderer(62, line(62)))
      expect(tipText().getAttribute('transform')).toBe('translate(5,-5)')
    })
  })

  describe('without text measurement (jsdom fallback)', () => {
    it('still flips near the right edge using the estimated width', () => {
      expect(typeof SVGElement.prototype.getBBox).not.toBe('function')
      init()

      hover(62)
      expect(tipText().getAttribute('transform')).toBe('translate(5,-5)')

      hover(73)
      expect(tipText().getAttribute('text-anchor')).toBe('end')
      expect(tipText().getAttribute('transform')).toBe('translate(-5,-5)')
    })

    it('does nothing while the tip is hidden', () => {
      init()
      hover(73)
      const before = tipText().getAttribute('transform')

      // mouse leaves the plot: function-plot hides the tip
      renderer.chart.emit('mouseout')
      renderer.placeTipLabel()
      expect(innerTip().style.display).toBe('none')
      expect(tipText().getAttribute('transform')).toBe(before)
    })
  })
})
