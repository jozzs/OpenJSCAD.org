/*
JSCAD Object to SVG Format Serialization

## License

Copyright (c) 2018 JSCAD Organization https://github.com/jscad

All code released under MIT license

Notes:
1) geom2 conversion to:
     SVG GROUP containing a SVG PATH for each outline of the geometry
2) geom3 conversion to:
     none
3) path2 conversion to:
     SVG GROUP containing a SVG PATH for each path
*/

const { geometries, maths, measurements, utils } = require('@jscad/modeling')

const stringify = require('onml/lib/stringify')

const mimeType = 'image/svg+xml'

/** Serialize the give objects to SVG format.
 * @param {Object} [options] - options for serialization
 * @param {Object|Array} objects - objects to serialize as SVG
 * @returns {Array} serialized contents, SVG format
 */
const serialize = (options, ...objects) => {
  const defaults = {
    unit: 'mm', // em | ex | px | in | cm | mm | pt | pc
    decimals: 10000,
    statusCallback: null
  }
  options = Object.assign({}, defaults, options)

  objects = utils.flatten(objects)

  // convert only 2D geometries
  const objects2d = objects.filter((object) => geometries.geom2.isA(object) || geometries.path2.isA(object))

  if (objects2d.length === 0) throw new Error('only 2D geometries can be serialized to SVG')
  if (objects.length !== objects2d.length) console.warn('some objects could not be serialized to SVG')

  options.statusCallback && options.statusCallback({ progress: 0 })

  // get the lower and upper bounds of ALL convertable objects
  const bounds = getBounds(objects2d)

  let width = 0
  let height = 0
  if (bounds) {
    width = Math.round((bounds[1][0] - bounds[0][0]) * options.decimals) / options.decimals
    height = Math.round((bounds[1][1] - bounds[0][1]) * options.decimals) / options.decimals
  }

  let body = ['svg',
    {
      width: width + options.unit,
      height: height + options.unit,
      viewBox: ('0 0 ' + width + ' ' + height),
      version: '1.1',
      baseProfile: 'tiny',
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink'
    }
  ]
  if (bounds) {
    body = body.concat(convertObjects(objects2d, bounds, options))
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by OpenJSCAD.org -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1 Tiny//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11-tiny.dtd">
${stringify(body)}`

  options.statusCallback && options.statusCallback({ progress: 100 })
  return [svg]
}

/*
 * Measure the bounds of the given objects, which is required to offset all points to positive X/Y values.
 */
const getBounds = (objects) => {
  const allbounds = measurements.measureBounds(objects)

  if (objects.length === 1) return allbounds

  // create a sum of the bounds
  const sumofbounds = allbounds.reduce((sum, bounds) => {
    maths.vec3.min(sum[0], sum[0], bounds[0])
    maths.vec3.max(sum[1], sum[1], bounds[1])
    return sum
  }, [[0, 0, 0], [0, 0, 0]])
  return sumofbounds
}

const convertObjects = (objects, bounds, options) => {
  const xoffset = 0 - bounds[0][0] // offset to X=0
  const yoffset = 0 - bounds[1][1] // offset to Y=0

  const contents = []
  objects.forEach((object, i) => {
    options.statusCallback && options.statusCallback({ progress: 100 * i / objects.length })

    if (geometries.geom2.isA(object)) {
      contents.push(convertGeom2(object, [xoffset, yoffset], options))
    }
    if (geometries.path2.isA(object)) {
      contents.push(convertPaths([object], [xoffset, yoffset], options))
    }
  })
  return contents
}

const reflect = (x, y, px, py) => {
  const ox = x - px
  const oy = y - py
  if (x === px && y === px) return [x, y]
  if (x === px) return [x, py - (oy)]
  if (y === py) return [px - (-ox), y]
  return [px - (-ox), py - (oy)]
}

const convertGeom2 = (object, offsets, options) => {
  const outlines = geometries.geom2.toOutlines(object)
  const paths = outlines.map((outline) => geometries.path2.fromPoints({ closed: true }, outline))
  if (object.color) {
    paths.forEach((path) => {
      path.fill = object.color
    })
  }
  return convertToContinousPath(paths, offsets, options)
}

const convertToContinousPath = (paths, offsets, options) => {
  let instructions = ''
  paths.forEach((path) => (instructions += convertPath(path, offsets, options)))
  let continouspath = ['path', { d: instructions }]
  if (paths.length > 0) {
    const path0 = paths[0]
    if (path0.fill) {
      continouspath = ['path', { 'fill-rule': 'evenodd', fill: convertColor(path0.fill), d: instructions }]
    }
  }
  return ['g', continouspath]
}

const convertPaths = (paths, offsets, options) => paths.reduce((res, path, i) => {
  if (path.color) {
    return res.concat([['path', { stroke: convertColor(path.color), 'stroke-width': 1, d: convertPath(path, offsets, options) }]])
  }
  return res.concat([['path', { d: convertPath(path, offsets, options) }]])
}, ['g'])

const convertPath = (path, offsets, options) => {
  let str = ''
  const numpointsClosed = path.points.length + (path.isClosed ? 1 : 0)
  for (let pointindex = 0; pointindex < numpointsClosed; pointindex++) {
    let pointindexwrapped = pointindex
    if (pointindexwrapped >= path.points.length) pointindexwrapped -= path.points.length
    const point = path.points[pointindexwrapped]
    const offpoint = [point[0] + offsets[0], point[1] + offsets[1]]
    const svgpoint = reflect(offpoint[0], offpoint[1], 0, 0)
    const x = Math.round(svgpoint[0] * options.decimals) / options.decimals
    const y = Math.round(svgpoint[1] * options.decimals) / options.decimals
    if (pointindex > 0) {
      str += `L${x} ${y}`
    } else {
      str += `M${x} ${y}`
    }
  }
  return str
}

const convertColor = (color) => `rgb(${color[0] * 255},${color[1] * 255},${color[2] * 255},${color[3] * 255})`

module.exports = {
  serialize,
  mimeType
}
