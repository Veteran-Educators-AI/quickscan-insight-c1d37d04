/**
 * Structured Geometry SVG Renderer
 * 
 * Renders GeometryMetadata into deterministic, pixel-perfect SVG diagrams.
 * This is the core of Phase 3 - replacing AI generation with structured rendering.
 * 
 * @module geometryRenderer
 * @version 1.1.0
 */

import {
  GeometryMetadata,
  GeometryVertex,
  GeometryShapeType,
  GeometryRenderError,
  GeometryErrorCode,
} from './geometryTypes.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// SVG STYLE CONSTANTS (P4.3 - Visual Style Guide)
// ═══════════════════════════════════════════════════════════════════════════════

export const SVGStyleConstants = {
  // Canvas
  WIDTH: 400,
  HEIGHT: 400,
  PADDING: 40,
  
  // Colors
  BACKGROUND: '#ffffff',
  GRID_LINE: '#e5e7eb',
  AXIS_LINE: '#000000',
  SHAPE_STROKE: '#1f2937',
  SHAPE_FILL: 'none',
  POINT_FILL: '#000000',
  LABEL_COLOR: '#000000',
  
  // Stroke widths
  GRID_STROKE_WIDTH: 0.5,
  AXIS_STROKE_WIDTH: 2,
  SHAPE_STROKE_WIDTH: 2,
  
  // Fonts
  FONT_FAMILY: 'Arial, sans-serif',
  FONT_SIZE_LABEL: 14,
  FONT_SIZE_AXIS: 12,
  FONT_SIZE_MEASUREMENT: 13,
  
  // Point markers
  POINT_RADIUS: 4,
  
  // Right angle marker
  RIGHT_ANGLE_SIZE: 12,
};

// ═══════════════════════════════════════════════════════════════════════════════
// NON-SCALING-STROKE ATTRIBUTE (Bug fix #3)
// ═══════════════════════════════════════════════════════════════════════════════
const NSS = ' vector-effect="non-scaling-stroke"';

// ═══════════════════════════════════════════════════════════════════════════════
// SVG HEADER HELPER (Bug fix #3 - preserveAspectRatio)
// ═══════════════════════════════════════════════════════════════════════════════

function svgHeader(width: number, height: number): string {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFORM SCALE HELPER (Bug fix #1 - division by zero + uniform scale)
// ═══════════════════════════════════════════════════════════════════════════════

interface UniformScaleResult {
  scale: number;
  offsetX: number;
  offsetY: number;
  toSvgX: (x: number) => number;
  toSvgY: (y: number) => number;
}

function computeUniformScale(
  minX: number, maxX: number, minY: number, maxY: number,
  width: number, height: number, padding: number
): UniformScaleResult {
  const safeRangeX = (maxX - minX) || 1;
  const safeRangeY = (maxY - minY) || 1;
  const drawW = width - 2 * padding;
  const drawH = height - 2 * padding;
  const scale = Math.min(drawW / safeRangeX, drawH / safeRangeY);

  // Centre the content in the available area
  const usedW = safeRangeX * scale;
  const usedH = safeRangeY * scale;
  const offsetX = padding + (drawW - usedW) / 2;
  const offsetY = padding + (drawH - usedH) / 2;

  const toSvgX = (x: number) => offsetX + (x - minX) * scale;
  const toSvgY = (y: number) => height - offsetY - (y - minY) * scale;

  return { scale, offsetX, offsetY, toSvgX, toSvgY };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART LABEL PLACEMENT (Bug fix #2 - label collision)
// ═══════════════════════════════════════════════════════════════════════════════

const LABEL_DIRECTIONS: [number, number][] = [
  [1, -1],   // top-right
  [-1, -1],  // top-left
  [1, 1],    // bottom-right
  [-1, 1],   // bottom-left
  [0, -1],   // top
  [0, 1],    // bottom
  [1, 0],    // right
  [-1, 0],   // left
];

function smartLabelOffset(
  vertex: GeometryVertex,
  allVertices: GeometryVertex[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
  canvasW: number,
  canvasH: number
): { dx: number; dy: number } {
  const vx = toSvgX(vertex.x);
  const vy = toSvgY(vertex.y);
  const dist = 14;

  // Score each of the 8 directions
  let bestDir = LABEL_DIRECTIONS[0];
  let bestScore = -Infinity;

  for (const [dx, dy] of LABEL_DIRECTIONS) {
    const lx = vx + dx * dist;
    const ly = vy + dy * dist;

    // Penalty for being close to other vertices
    let score = 0;
    for (const other of allVertices) {
      if (other === vertex) continue;
      const ox = toSvgX(other.x);
      const oy = toSvgY(other.y);
      const d = Math.sqrt((lx - ox) ** 2 + (ly - oy) ** 2);
      score += d; // farther from others = better
    }

    // Penalty for going out of bounds
    if (lx < 8 || lx > canvasW - 20 || ly < 12 || ly > canvasH - 8) {
      score -= 10000;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = [dx, dy];
    }
  }

  // Compute final offset and clamp
  let finalDx = bestDir[0] * dist;
  let finalDy = bestDir[1] * dist;

  // Clamp resulting label position
  const clampedX = Math.max(8, Math.min(canvasW - 20, vx + finalDx));
  const clampedY = Math.max(12, Math.min(canvasH - 8, vy + finalDy));
  finalDx = clampedX - vx;
  finalDy = clampedY - vy;

  return { dx: finalDx, dy: finalDy };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders GeometryMetadata into an SVG data URL
 * 
 * @param geometry - The geometry metadata to render
 * @returns SVG data URL or null if rendering fails
 */
export function renderGeometryToSVG(geometry: GeometryMetadata): string | null {
  try {
    console.log(`[GeometryRenderer] Rendering ${geometry.type}...`);
    
    // Route to appropriate renderer based on type
    let svgContent: string | null = null;
    
    switch (geometry.type) {
      case GeometryShapeType.COORDINATE_POLYGON:
      case GeometryShapeType.TRIANGLE:
      case GeometryShapeType.QUADRILATERAL:
        svgContent = renderPolygon(geometry);
        break;
        
      case GeometryShapeType.CIRCLE:
      case GeometryShapeType.CIRCLE_CHORD:
      case GeometryShapeType.CIRCLE_TANGENT:
      case GeometryShapeType.CIRCLE_SECANT:
        svgContent = renderCircle(geometry);
        break;
        
      case GeometryShapeType.NUMBER_LINE:
        svgContent = renderNumberLine(geometry);
        break;
        
      case GeometryShapeType.ROTATION:
      case GeometryShapeType.REFLECTION:
      case GeometryShapeType.TRANSLATION:
      case GeometryShapeType.DILATION:
        svgContent = renderTransformation(geometry);
        break;
        
      case GeometryShapeType.ANGLE_DIAGRAM:
        svgContent = renderAngle(geometry);
        break;
        
      default:
        console.warn(`[GeometryRenderer] No renderer for type: ${geometry.type}`);
        return null;
    }
    
    if (!svgContent) {
      return null;
    }
    
    // Convert to data URL
    const base64 = btoa(svgContent);
    return `data:image/svg+xml;base64,${base64}`;
    
  } catch (error) {
    console.error('[GeometryRenderer] Rendering error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POLYGON RENDERER (Triangles, Quadrilaterals, Coordinate Polygons)
// ═══════════════════════════════════════════════════════════════════════════════

function renderPolygon(geometry: GeometryMetadata): string | null {
  if (!geometry.vertices || geometry.vertices.length < 2) {
    return null;
  }
  
  const { WIDTH, HEIGHT, PADDING } = SVGStyleConstants;
  const vertices = geometry.vertices;
  const axes = geometry.axes;
  
  // Determine coordinate system bounds
  const minX = axes?.minX ?? Math.min(...vertices.map(v => v.x)) - 1;
  const maxX = axes?.maxX ?? Math.max(...vertices.map(v => v.x)) + 1;
  const minY = axes?.minY ?? Math.min(...vertices.map(v => v.y)) - 1;
  const maxY = axes?.maxY ?? Math.max(...vertices.map(v => v.y)) + 1;
  
  // Bug fix #1: uniform scale with division-by-zero protection
  const { toSvgX, toSvgY } = computeUniformScale(minX, maxX, minY, maxY, WIDTH, HEIGHT, PADDING);
  
  let svg = svgHeader(WIDTH, HEIGHT);
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SVGStyleConstants.BACKGROUND}"/>`;
  
  // Draw coordinate axes if present
  if (axes && axes.showGrid) {
    svg += renderGrid(minX, maxX, minY, maxY, toSvgX, toSvgY, axes.tickStep || 1, axes.showNumbers);
  }
  
  // Draw polygon
  const points = vertices.map(v => `${toSvgX(v.x)},${toSvgY(v.y)}`).join(' ');
  svg += `<polygon points="${points}" fill="${SVGStyleConstants.SHAPE_FILL}" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
  
  // Draw vertices and labels
  for (const vertex of vertices) {
    const svgX = toSvgX(vertex.x);
    const svgY = toSvgY(vertex.y);
    
    // Draw point
    svg += `<circle cx="${svgX}" cy="${svgY}" r="${SVGStyleConstants.POINT_RADIUS}" fill="${SVGStyleConstants.POINT_FILL}"/>`;
    
    // Bug fix #2: smart label placement
    const { dx, dy } = smartLabelOffset(vertex, vertices, toSvgX, toSvgY, WIDTH, HEIGHT);
    const labelX = svgX + dx;
    const labelY = svgY + dy;
    svg += `<text x="${labelX}" y="${labelY}" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="${SVGStyleConstants.LABEL_COLOR}">${vertex.label}(${vertex.x},${vertex.y})</text>`;
  }
  
  // Draw measurements if present
  if (geometry.measurements) {
    svg += renderMeasurements(geometry.measurements, vertices, toSvgX, toSvgY);
  }
  
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCLE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderCircle(geometry: GeometryMetadata): string | null {
  if (!geometry.circle) {
    return null;
  }
  
  const { WIDTH, HEIGHT, PADDING } = SVGStyleConstants;
  const circle = geometry.circle;
  const axes = geometry.axes;
  
  // Determine bounds
  const minX = axes?.minX ?? circle.center.x - circle.radius - 1;
  const maxX = axes?.maxX ?? circle.center.x + circle.radius + 1;
  const minY = axes?.minY ?? circle.center.y - circle.radius - 1;
  const maxY = axes?.maxY ?? circle.center.y + circle.radius + 1;
  
  // Bug fix #1: uniform scale with division-by-zero protection
  const { scale, toSvgX, toSvgY } = computeUniformScale(minX, maxX, minY, maxY, WIDTH, HEIGHT, PADDING);
  
  let svg = svgHeader(WIDTH, HEIGHT);
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SVGStyleConstants.BACKGROUND}"/>`;
  
  // Draw grid if axes present
  if (axes && axes.showGrid) {
    svg += renderGrid(minX, maxX, minY, maxY, toSvgX, toSvgY, axes.tickStep || 1, axes.showNumbers);
  }
  
  // Draw circle
  const centerX = toSvgX(circle.center.x);
  const centerY = toSvgY(circle.center.y);
  const radiusSvg = circle.radius * scale;
  
  svg += `<circle cx="${centerX}" cy="${centerY}" r="${radiusSvg}" fill="${SVGStyleConstants.SHAPE_FILL}" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
  
  // Draw center point
  svg += `<circle cx="${centerX}" cy="${centerY}" r="${SVGStyleConstants.POINT_RADIUS}" fill="${SVGStyleConstants.POINT_FILL}"/>`;
  
  // Bug fix #2: smart label for center
  const centerVertex: GeometryVertex = { label: circle.center.label || 'O', x: circle.center.x, y: circle.center.y };
  const { dx, dy } = smartLabelOffset(centerVertex, [], toSvgX, toSvgY, WIDTH, HEIGHT);
  svg += `<text x="${centerX + dx}" y="${centerY + dy}" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="${SVGStyleConstants.LABEL_COLOR}">${circle.center.label || 'O'}(${circle.center.x},${circle.center.y})</text>`;
  
  // Draw chord if present
  if (circle.chordPoints && geometry.type === GeometryShapeType.CIRCLE_CHORD) {
    const [p1, p2] = circle.chordPoints;
    const x1 = toSvgX(p1.x);
    const y1 = toSvgY(p1.y);
    const x2 = toSvgX(p2.x);
    const y2 = toSvgY(p2.y);
    
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
    svg += `<circle cx="${x1}" cy="${y1}" r="${SVGStyleConstants.POINT_RADIUS}" fill="${SVGStyleConstants.POINT_FILL}"/>`;
    svg += `<circle cx="${x2}" cy="${y2}" r="${SVGStyleConstants.POINT_RADIUS}" fill="${SVGStyleConstants.POINT_FILL}"/>`;
  }
  
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NUMBER LINE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderNumberLine(geometry: GeometryMetadata): string | null {
  if (!geometry.numberLine) {
    return null;
  }
  
  const { WIDTH, HEIGHT } = SVGStyleConstants;
  const numberLine = geometry.numberLine;
  const min = numberLine.min;
  const max = numberLine.max;
  const range = (max - min) || 1; // Bug fix #1: division-by-zero guard
  
  const padding = 60;
  const lineY = HEIGHT / 2;
  const scaleX = (WIDTH - 2 * padding) / range;
  
  const toSvgX = (value: number) => padding + (value - min) * scaleX;
  
  let svg = svgHeader(WIDTH, HEIGHT);
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SVGStyleConstants.BACKGROUND}"/>`;
  
  // Draw main line
  svg += `<line x1="${padding}" y1="${lineY}" x2="${WIDTH - padding}" y2="${lineY}" stroke="${SVGStyleConstants.AXIS_LINE}" stroke-width="${SVGStyleConstants.AXIS_STROKE_WIDTH}"${NSS}/>`;
  
  // Draw tick marks and labels
  const tickInterval = numberLine.tickInterval || 1;
  for (let value = min; value <= max; value += tickInterval) {
    const x = toSvgX(value);
    svg += `<line x1="${x}" y1="${lineY - 8}" x2="${x}" y2="${lineY + 8}" stroke="${SVGStyleConstants.AXIS_LINE}" stroke-width="${SVGStyleConstants.AXIS_STROKE_WIDTH}"${NSS}/>`;
    svg += `<text x="${x}" y="${lineY + 25}" text-anchor="middle" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_AXIS}" fill="${SVGStyleConstants.LABEL_COLOR}">${value}</text>`;
  }
  
  // Draw highlighted points
  if (numberLine.highlightedPoints) {
    for (const point of numberLine.highlightedPoints) {
      const x = toSvgX(point.value);
      const isOpen = point.type === 'open';
      
      if (isOpen) {
        svg += `<circle cx="${x}" cy="${lineY}" r="6" fill="${SVGStyleConstants.BACKGROUND}" stroke="${SVGStyleConstants.POINT_FILL}" stroke-width="2"${NSS}/>`;
      } else {
        svg += `<circle cx="${x}" cy="${lineY}" r="6" fill="${SVGStyleConstants.POINT_FILL}"/>`;
      }
      
      if (point.label) {
        svg += `<text x="${x}" y="${lineY - 15}" text-anchor="middle" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="${SVGStyleConstants.LABEL_COLOR}">${point.label}</text>`;
      }
    }
  }
  
  // Draw shaded regions
  if (numberLine.shadedRegions) {
    for (const region of numberLine.shadedRegions) {
      const x1 = toSvgX(region.start);
      const x2 = toSvgX(region.end);
      svg += `<line x1="${x1}" y1="${lineY}" x2="${x2}" y2="${lineY}" stroke="#3b82f6" stroke-width="4"${NSS}/>`;
    }
  }
  
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORMATION RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderTransformation(geometry: GeometryMetadata): string | null {
  if (!geometry.transformation) {
    return null;
  }
  
  const { WIDTH, HEIGHT, PADDING } = SVGStyleConstants;
  const transformation = geometry.transformation;
  const allVertices = [...transformation.originalVertices, ...transformation.transformedVertices];
  
  // Determine bounds
  const minX = Math.min(...allVertices.map(v => v.x)) - 1;
  const maxX = Math.max(...allVertices.map(v => v.x)) + 1;
  const minY = Math.min(...allVertices.map(v => v.y)) - 1;
  const maxY = Math.max(...allVertices.map(v => v.y)) + 1;
  
  // Bug fix #1: uniform scale with division-by-zero protection
  const { toSvgX, toSvgY } = computeUniformScale(minX, maxX, minY, maxY, WIDTH, HEIGHT, PADDING);
  
  let svg = svgHeader(WIDTH, HEIGHT);
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SVGStyleConstants.BACKGROUND}"/>`;
  
  // Draw grid
  if (geometry.axes && geometry.axes.showGrid) {
    svg += renderGrid(minX, maxX, minY, maxY, toSvgX, toSvgY, 1, true);
  }
  
  // Draw original shape (solid)
  const origPoints = transformation.originalVertices.map(v => `${toSvgX(v.x)},${toSvgY(v.y)}`).join(' ');
  svg += `<polygon points="${origPoints}" fill="none" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
  
  // Draw transformed shape (dashed)
  const transPoints = transformation.transformedVertices.map(v => `${toSvgX(v.x)},${toSvgY(v.y)}`).join(' ');
  svg += `<polygon points="${transPoints}" fill="none" stroke="#3b82f6" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}" stroke-dasharray="5,5"${NSS}/>`;
  
  // Label vertices — Bug fix #2: smart placement
  for (const vertex of transformation.originalVertices) {
    const x = toSvgX(vertex.x);
    const y = toSvgY(vertex.y);
    svg += `<circle cx="${x}" cy="${y}" r="${SVGStyleConstants.POINT_RADIUS}" fill="${SVGStyleConstants.POINT_FILL}"/>`;
    const { dx, dy } = smartLabelOffset(vertex, allVertices, toSvgX, toSvgY, WIDTH, HEIGHT);
    svg += `<text x="${x + dx}" y="${y + dy}" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="${SVGStyleConstants.LABEL_COLOR}">${vertex.label}</text>`;
  }
  
  for (const vertex of transformation.transformedVertices) {
    const x = toSvgX(vertex.x);
    const y = toSvgY(vertex.y);
    svg += `<circle cx="${x}" cy="${y}" r="${SVGStyleConstants.POINT_RADIUS}" fill="#3b82f6"/>`;
    const { dx, dy } = smartLabelOffset(vertex, allVertices, toSvgX, toSvgY, WIDTH, HEIGHT);
    svg += `<text x="${x + dx}" y="${y + dy}" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="#3b82f6">${vertex.label}</text>`;
  }
  
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANGLE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderAngle(geometry: GeometryMetadata): string | null {
  if (!geometry.angle) {
    return null;
  }
  
  const { WIDTH, HEIGHT } = SVGStyleConstants;
  const angle = geometry.angle;
  
  // Simple centered angle diagram
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const rayLength = 120;
  
  let svg = svgHeader(WIDTH, HEIGHT);
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SVGStyleConstants.BACKGROUND}"/>`;
  
  // Draw rays
  svg += `<line x1="${centerX}" y1="${centerY}" x2="${centerX - rayLength}" y2="${centerY}" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
  
  const angleRad = (angle.measure || 45) * Math.PI / 180;
  const ray2X = centerX + rayLength * Math.cos(angleRad);
  const ray2Y = centerY - rayLength * Math.sin(angleRad);
  svg += `<line x1="${centerX}" y1="${centerY}" x2="${ray2X}" y2="${ray2Y}" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="${SVGStyleConstants.SHAPE_STROKE_WIDTH}"${NSS}/>`;
  
  // Draw angle arc
  const arcRadius = 40;
  svg += `<path d="M ${centerX + arcRadius} ${centerY} A ${arcRadius} ${arcRadius} 0 0 0 ${centerX + arcRadius * Math.cos(angleRad)} ${centerY - arcRadius * Math.sin(angleRad)}" fill="none" stroke="${SVGStyleConstants.SHAPE_STROKE}" stroke-width="1.5"${NSS}/>`;
  
  // Label
  if (angle.label) {
    svg += `<text x="${centerX + 50}" y="${centerY - 20}" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_LABEL}" fill="${SVGStyleConstants.LABEL_COLOR}">${angle.label}</text>`;
  }
  
  svg += '</svg>';
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function renderGrid(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
  tickStep: number,
  showNumbers?: boolean
): string {
  let svg = '';
  
  // Vertical grid lines
  for (let x = Math.ceil(minX); x <= Math.floor(maxX); x += tickStep) {
    const svgX = toSvgX(x);
    svg += `<line x1="${svgX}" y1="${toSvgY(maxY)}" x2="${svgX}" y2="${toSvgY(minY)}" stroke="${SVGStyleConstants.GRID_LINE}" stroke-width="${SVGStyleConstants.GRID_STROKE_WIDTH}"${NSS}/>`;
  }
  
  // Horizontal grid lines
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y += tickStep) {
    const svgY = toSvgY(y);
    svg += `<line x1="${toSvgX(minX)}" y1="${svgY}" x2="${toSvgX(maxX)}" y2="${svgY}" stroke="${SVGStyleConstants.GRID_LINE}" stroke-width="${SVGStyleConstants.GRID_STROKE_WIDTH}"${NSS}/>`;
  }
  
  // Axes
  if (minX <= 0 && maxX >= 0) {
    const xAxisX = toSvgX(0);
    svg += `<line x1="${xAxisX}" y1="${toSvgY(minY)}" x2="${xAxisX}" y2="${toSvgY(maxY)}" stroke="${SVGStyleConstants.AXIS_LINE}" stroke-width="${SVGStyleConstants.AXIS_STROKE_WIDTH}"${NSS}/>`;
  }
  
  if (minY <= 0 && maxY >= 0) {
    const yAxisY = toSvgY(0);
    svg += `<line x1="${toSvgX(minX)}" y1="${yAxisY}" x2="${toSvgX(maxX)}" y2="${yAxisY}" stroke="${SVGStyleConstants.AXIS_LINE}" stroke-width="${SVGStyleConstants.AXIS_STROKE_WIDTH}"${NSS}/>`;
  }
  
  // Numbers
  if (showNumbers) {
    for (let x = Math.ceil(minX); x <= Math.floor(maxX); x += tickStep) {
      if (x === 0) continue;
      const svgX = toSvgX(x);
      const svgY = toSvgY(0) + 20;
      svg += `<text x="${svgX}" y="${svgY}" text-anchor="middle" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_AXIS}" fill="${SVGStyleConstants.LABEL_COLOR}">${x}</text>`;
    }
    
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y += tickStep) {
      if (y === 0) continue;
      const svgX = toSvgX(0) - 20;
      const svgY = toSvgY(y) + 5;
      svg += `<text x="${svgX}" y="${svgY}" text-anchor="end" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_AXIS}" fill="${SVGStyleConstants.LABEL_COLOR}">${y}</text>`;
    }
  }
  
  return svg;
}

function renderMeasurements(
  measurements: any[],
  vertices: GeometryVertex[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number
): string {
  let svg = '';
  
  for (const measurement of measurements) {
    if (measurement.type === 'length' && measurement.appliesTo && measurement.appliesTo.length === 2) {
      const v1 = vertices.find(v => v.label === measurement.appliesTo[0]);
      const v2 = vertices.find(v => v.label === measurement.appliesTo[1]);
      
      if (v1 && v2) {
        const x1 = toSvgX(v1.x);
        const y1 = toSvgY(v1.y);
        const x2 = toSvgX(v2.x);
        const y2 = toSvgY(v2.y);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        svg += `<text x="${midX}" y="${midY - 5}" text-anchor="middle" font-family="${SVGStyleConstants.FONT_FAMILY}" font-size="${SVGStyleConstants.FONT_SIZE_MEASUREMENT}" fill="${SVGStyleConstants.LABEL_COLOR}">${measurement.value} ${measurement.unit}</text>`;
      }
    }
  }
  
  return svg;
}
