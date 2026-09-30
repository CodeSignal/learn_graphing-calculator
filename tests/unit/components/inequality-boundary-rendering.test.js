import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GraphEngine from '../../../client/graph-engine.js'
import FunctionPlotRenderer from '../../../client/renderers/function-plot-renderer.js'

// Renders inequality boundaries with the real function-plot library into jsdom and inspects
// the SVG it produces. A dash pattern only shows on a continuous path: function-plot's
// interval renderer emits one "M x y v h" sub-path per ~1px cell, and the dash restarts on
// each one, so the boundary looked solid even though it carried stroke-dasharray.

const VIEWPORT = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }
const SIZE = 500

const subpathCount = (path) => (path.getAttribute('d').match(/M/g) || []).length

const parsePolyline = (path) => path.getAttribute('d')
  .replace(/^M/, '')
  .split('L')
  .map((pair) => pair.split(',').map(Number))

describe('inequality boundary rendering (real function-plot)', () => {
  let container
  let engine
  let renderer

  const render = (expressions, scope = {}) => {
    const functions = expressions.map((expression, index) => ({
      id: `f${index}`,
      expression,
      color: '#3355ff',
      visible: true
    }))
    const { data, inequalities } = engine.mapFunctionsToPlotData(functions, scope)
    renderer.updateData(data, inequalities)
    return Array.from(container.querySelectorAll('g.graph')).map((graph) => (
      Array.from(graph.querySelectorAll('path.line'))
    ))
  }

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    container = document.createElement('div')
    container.id = 'graph-canvas'
    document.body.appendChild(container)

    engine = new GraphEngine('graph-canvas')
    renderer = new FunctionPlotRenderer(container)
    renderer.init({
      width: SIZE,
      height: SIZE,
      viewport: VIEWPORT,
      showGrid: false,
      onZoom: () => {}
    })
  })

  afterEach(() => {
    renderer.destroy()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it.each([
    'y > 2x - 1',
    'y < m*x + b'
  ])('draws strict boundary %s as one dashed continuous path', (expression) => {
    const [paths] = render([expression], { m: 2, b: 1 })

    expect(paths).toHaveLength(1)
    const [path] = paths
    expect(path.getAttribute('stroke-dasharray')).toBe('6,4')
    expect(path.getAttribute('stroke-linecap')).toBe('butt')
    expect(path.getAttribute('stroke-width')).toBe('2.5')
    expect(path.getAttribute('stroke')).toBe('#3355ff')
    expect(subpathCount(path)).toBe(1)
    expect(path.getAttribute('d')).not.toMatch(/\bv\b/)
    expect(parsePolyline(path).length).toBeGreaterThan(100)
  })

  it('draws inclusive boundaries as a solid continuous path', () => {
    const [[path]] = render(['x + y <= 5'])

    expect(path.getAttribute('stroke-dasharray')).toBe('none')
    expect(subpathCount(path)).toBe(1)
  })

  it('clears the dash when a boundary switches from strict to inclusive', () => {
    const [[strictPath]] = render(['y > 2x - 1'])
    expect(strictPath.getAttribute('stroke-dasharray')).toBe('6,4')

    const [[inclusivePath]] = render(['y >= 2x - 1'])
    expect(inclusivePath).toBe(strictPath)
    expect(inclusivePath.getAttribute('stroke-dasharray')).toBe('none')
  })

  it('draws a strict vertical boundary as a dashed segment spanning the view', () => {
    const [[path]] = render(['x < 3'])

    expect(path.getAttribute('stroke-dasharray')).toBe('6,4')
    expect(subpathCount(path)).toBe(1)
    const points = parsePolyline(path)
    expect(points).toHaveLength(2)
    expect(points[0][0]).toBeCloseTo(points[1][0])

    const yScale = renderer.chart.meta.yScale
    const [top, bottom] = [yScale(VIEWPORT.yMax), yScale(VIEWPORT.yMin)]
    expect(Math.min(points[0][1], points[1][1])).toBeLessThan(top)
    expect(Math.max(points[0][1], points[1][1])).toBeGreaterThan(bottom)
  })

  it('keeps the vertical boundary spanning the view after zooming in', () => {
    render(['x < 3'])

    renderer.chart.meta.xScale.domain([2.99, 3.01])
    renderer.chart.meta.yScale.domain([100, 100.02])
    renderer.chart.draw()

    const [path] = container.querySelectorAll('g.graph path.line')
    const points = parsePolyline(path)
    const yScale = renderer.chart.meta.yScale
    expect(Math.min(points[0][1], points[1][1])).toBeLessThan(yScale(100.02))
    expect(Math.max(points[0][1], points[1][1])).toBeGreaterThan(yScale(100))
    expect(Math.abs(points[1][1] - points[0][1])).toBeLessThan(SIZE * 2)
  })

  it('does not bridge domain gaps with a straight segment', () => {
    const [paths] = render(['y > sqrt(x^2 - 4)'])
    const xScale = renderer.chart.meta.xScale

    expect(paths.length).toBeGreaterThanOrEqual(2)
    paths.forEach((path) => {
      expect(path.getAttribute('stroke-dasharray')).toBe('6,4')
      const xs = parsePolyline(path).map(([x]) => xScale.invert(x))
      const crossesGap = xs.some((x) => x < -2.05) && xs.some((x) => x > 2.05)
      expect(crossesGap).toBe(false)
    })
  })

  it('keeps steep boundaries within a bounded band so browsers still dash them', () => {
    const [paths] = render(['y > e^x'])
    const yScale = renderer.chart.meta.yScale

    paths.forEach((path) => {
      parsePolyline(path).forEach(([, py]) => {
        expect(py).toBeGreaterThanOrEqual(yScale(30) - 1)
        expect(py).toBeLessThanOrEqual(yScale(-30) + 1)
      })
    })
  })

  it('still draws genuinely implicit boundaries as interval cells (known limitation)', () => {
    const [[path]] = render(['x^2 + y^2 < 9'])

    expect(path.getAttribute('stroke-dasharray')).toBe('6,4')
    expect(subpathCount(path)).toBeGreaterThan(100)
  })
})
