// NYS Regents Standards - JMAP Topics organized by subject
export interface JMAPTopic {
  name: string;
  standard: string;
  url: string;
  /** Optional secondary reference (e.g. CUNY BMCC MAT 150 outcome). Never rendered in place of `standard`. */
  secondaryStandard?: string;
}

export interface TopicCategory {
  category: string;
  topics: JMAPTopic[];
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  categories: TopicCategory[];
}

export const GEOMETRY_TOPICS: TopicCategory[] = [
  {
    category: 'TOOLS OF GEOMETRY',
    topics: [
      { name: 'Planes', standard: 'G.CO.A.1', url: 'https://www.jmap.org/htmlstandard/G.CO.A.1.htm' },
      { name: 'Solids', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Cross-Sections of Three-Dimensional Objects', standard: 'G.GMD.B.4', url: 'https://www.jmap.org/htmlstandard/G.GMD.B.4.htm' },
      { name: 'Constructions', standard: 'G.CO.D.12', url: 'https://www.jmap.org/htmlstandard/G.CO.D.12.htm' },
      { name: 'Constructions (Advanced)', standard: 'G.CO.D.13', url: 'https://www.jmap.org/htmlstandard/G.CO.D.13.htm' },
    ],
  },
  {
    category: 'LINES AND ANGLES',
    topics: [
      { name: 'Points, Lines, and Planes', standard: 'G.CO.A.1', url: 'https://www.jmap.org/htmlstandard/G.CO.A.1.htm' },
      { name: 'Parallel and Perpendicular Lines', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
      { name: 'Proofs: Lines and Angles', standard: 'G.CO.C.9', url: 'https://www.jmap.org/htmlstandard/G.CO.C.9.htm' },
      { name: 'Directed Line Segments', standard: 'G.GPE.B.6', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.6.htm' },
    ],
  },
  {
    category: 'TRIANGLES',
    topics: [
      { name: 'Triangle Proofs', standard: 'G.CO.C.10', url: 'https://www.jmap.org/htmlstandard/G.CO.C.10.htm' },
      { name: 'Triangle Congruence', standard: 'G.SRT.B.5', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.5.htm' },
      { name: 'Triangle Similarity', standard: 'G.SRT.A.2', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.2.htm' },
      { name: 'Triangle Similarity Proofs', standard: 'G.SRT.A.3', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.3.htm' },
      { name: 'Special Right Triangles', standard: 'G.SRT.C.8', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.8.htm' },
      { name: 'Triangle Inequality Theorem', standard: 'G.CO.C.10', url: 'https://www.jmap.org/htmlstandard/G.CO.C.10.htm' },
    ],
  },
  {
    category: 'POLYGONS',
    topics: [
      { name: 'Parallelogram Proofs', standard: 'G.CO.C.11', url: 'https://www.jmap.org/htmlstandard/G.CO.C.11.htm' },
      { name: 'Special Quadrilaterals', standard: 'G.CO.C.11', url: 'https://www.jmap.org/htmlstandard/G.CO.C.11.htm' },
      { name: 'Interior and Exterior Angles', standard: 'G.CO.C.10', url: 'https://www.jmap.org/htmlstandard/G.CO.C.10.htm' },
      { name: 'Polygon Similarity', standard: 'G.SRT.A.2', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.2.htm' },
      { name: 'Coordinate Geometry Proofs', standard: 'G.GPE.B.4', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.4.htm' },
    ],
  },
  {
    category: 'CONICS',
    topics: [
      { name: 'Equations of Circles', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Chords, Secants, and Tangents', standard: 'G.C.A.2', url: 'https://www.jmap.org/htmlstandard/G.C.A.2.htm' },
      { name: 'Inscribed Angles', standard: 'G.C.A.2', url: 'https://www.jmap.org/htmlstandard/G.C.A.2.htm' },
      { name: 'Arc Length and Sector Area', standard: 'G.C.B.5', url: 'https://www.jmap.org/htmlstandard/G.C.B.5.htm' },
      { name: 'Inscribed and Circumscribed Circles', standard: 'G.C.A.3', url: 'https://www.jmap.org/htmlstandard/G.C.A.3.htm' },
    ],
  },
  {
    category: 'TRANSFORMATIONS',
    topics: [
      { name: 'Rotations', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Reflections', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Translations', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Dilations', standard: 'G.SRT.A.1', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.1.htm' },
      { name: 'Compositions of Transformations', standard: 'G.CO.A.5', url: 'https://www.jmap.org/htmlstandard/G.CO.A.5.htm' },
      { name: 'Symmetry', standard: 'G.CO.A.3', url: 'https://www.jmap.org/htmlstandard/G.CO.A.3.htm' },
    ],
  },
  {
    category: 'TRIGONOMETRY',
    topics: [
      { name: 'Trigonometric Ratios', standard: 'G.SRT.C.6', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.6.htm' },
      { name: 'Cofunctions', standard: 'G.SRT.C.7', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.7.htm' },
      { name: 'Solving for a Side', standard: 'G.SRT.C.8', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.8.htm' },
      { name: 'Solving for an Angle', standard: 'G.SRT.C.8', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.8.htm' },
      { name: 'Law of Sines', standard: 'G.SRT.D.10', url: 'https://www.jmap.org/htmlstandard/G.SRT.D.10.htm' },
      { name: 'Law of Cosines', standard: 'G.SRT.D.10', url: 'https://www.jmap.org/htmlstandard/G.SRT.D.10.htm' },
    ],
  },
  {
    category: 'LOGIC',
    topics: [
      { name: 'Definitions and Biconditionals', standard: 'G.CO.A.1', url: 'https://www.jmap.org/htmlstandard/G.CO.A.1.htm' },
      { name: 'Conditional Statements', standard: 'G.CO.C.9', url: 'https://www.jmap.org/htmlstandard/G.CO.C.9.htm' },
      { name: 'Negations', standard: 'G.CO.C.9', url: 'https://www.jmap.org/htmlstandard/G.CO.C.9.htm' },
      { name: 'Proof Techniques', standard: 'G.CO.C.9', url: 'https://www.jmap.org/htmlstandard/G.CO.C.9.htm' },
    ],
  },
  {
    category: 'AREA AND VOLUME',
    topics: [
      { name: 'Area of Polygons', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Area of Regular Polygons', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Area of Circles', standard: 'G.C.B.5', url: 'https://www.jmap.org/htmlstandard/G.C.B.5.htm' },
      { name: 'Area of Composite Figures', standard: 'G.MG.A.3', url: 'https://www.jmap.org/htmlstandard/G.MG.A.3.htm' },
      { name: 'Volume of Prisms', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Cylinders', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Pyramids', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Cones', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Spheres', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Surface Area of Prisms', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Surface Area of Cylinders', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Surface Area of Pyramids', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Surface Area of Cones', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Surface Area of Spheres', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Cavalieri\'s Principle', standard: 'G.GMD.A.2', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.2.htm' },
      { name: 'Density', standard: 'G.MG.A.2', url: 'https://www.jmap.org/htmlstandard/G.MG.A.2.htm' },
    ],
  },
  {
    category: 'COORDINATE GEOMETRY',
    topics: [
      { name: 'Distance Formula', standard: 'G.GPE.B.7', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.7.htm' },
      { name: 'Midpoint Formula', standard: 'G.GPE.B.6', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.6.htm' },
      { name: 'Slope', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
      { name: 'Parallel and Perpendicular Lines', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
      { name: 'Equations of Lines', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
      { name: 'Equations of Circles', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Equations of Parabolas', standard: 'G.GPE.A.2', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.2.htm' },
      { name: 'Coordinate Proofs', standard: 'G.GPE.B.4', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.4.htm' },
      { name: 'Partitioning a Line Segment', standard: 'G.GPE.B.6', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.6.htm' },
      { name: 'Perimeter in the Coordinate Plane', standard: 'G.GPE.B.7', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.7.htm' },
      { name: 'Area in the Coordinate Plane', standard: 'G.GPE.B.7', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.7.htm' },
    ],
  },
  {
    category: 'TRANSFORMATIONS',
    topics: [
      { name: 'Translations', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Reflections', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Rotations', standard: 'G.CO.A.4', url: 'https://www.jmap.org/htmlstandard/G.CO.A.4.htm' },
      { name: 'Dilations', standard: 'G.SRT.A.1', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.1.htm' },
      { name: 'Compositions of Transformations', standard: 'G.CO.A.5', url: 'https://www.jmap.org/htmlstandard/G.CO.A.5.htm' },
      { name: 'Rigid Motions', standard: 'G.CO.B.6', url: 'https://www.jmap.org/htmlstandard/G.CO.B.6.htm' },
      { name: 'Symmetry', standard: 'G.CO.A.3', url: 'https://www.jmap.org/htmlstandard/G.CO.A.3.htm' },
      { name: 'Rotational Symmetry', standard: 'G.CO.A.3', url: 'https://www.jmap.org/htmlstandard/G.CO.A.3.htm' },
      { name: 'Line Symmetry', standard: 'G.CO.A.3', url: 'https://www.jmap.org/htmlstandard/G.CO.A.3.htm' },
      { name: 'Mapping a Figure onto Itself', standard: 'G.CO.A.3', url: 'https://www.jmap.org/htmlstandard/G.CO.A.3.htm' },
    ],
  },
  {
    category: 'SIMILARITY AND CONGRUENCE',
    topics: [
      { name: 'Congruent Triangles', standard: 'G.CO.B.7', url: 'https://www.jmap.org/htmlstandard/G.CO.B.7.htm' },
      { name: 'Triangle Congruence: SSS', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'Triangle Congruence: SAS', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'Triangle Congruence: ASA', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'Triangle Congruence: AAS', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'Triangle Congruence: HL', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'CPCTC', standard: 'G.CO.B.7', url: 'https://www.jmap.org/htmlstandard/G.CO.B.7.htm' },
      { name: 'Similar Triangles', standard: 'G.SRT.A.2', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.2.htm' },
      { name: 'Triangle Similarity: AA', standard: 'G.SRT.A.3', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.3.htm' },
      { name: 'Triangle Similarity: SAS', standard: 'G.SRT.B.5', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.5.htm' },
      { name: 'Triangle Similarity: SSS', standard: 'G.SRT.B.5', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.5.htm' },
      { name: 'Proportions in Similar Triangles', standard: 'G.SRT.B.4', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.4.htm' },
      { name: 'Side Splitter Theorem', standard: 'G.SRT.B.4', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.4.htm' },
      { name: 'Midsegment of a Triangle', standard: 'G.CO.C.10', url: 'https://www.jmap.org/htmlstandard/G.CO.C.10.htm' },
      { name: 'Similarity Transformations', standard: 'G.SRT.A.2', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.2.htm' },
      { name: 'Scale Factor', standard: 'G.SRT.A.1', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.1.htm' },
    ],
  },
];

export const ALGEBRA1_TOPICS: TopicCategory[] = [
  {
    category: 'EXPRESSIONS AND EQUATIONS',
    topics: [
      { name: 'Polynomials', standard: 'A.SSE.A.1', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.1.htm' },
      { name: 'Factoring Polynomials', standard: 'A.SSE.A.2', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.2.htm' },
      { name: 'Operations with Polynomials', standard: 'A.APR.A.1', url: 'https://www.jmap.org/htmlstandard/A.APR.A.1.htm' },
      { name: 'Solving Linear Equations', standard: 'A.REI.B.3', url: 'https://www.jmap.org/htmlstandard/A.REI.B.3.htm' },
      { name: 'Solving Linear Inequalities', standard: 'A.REI.B.3', url: 'https://www.jmap.org/htmlstandard/A.REI.B.3.htm' },
    ],
  },
  {
    category: 'QUADRATICS',
    topics: [
      { name: 'Solving Quadratics by Factoring', standard: 'A.SSE.B.3', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Solving Quadratics by Graphing', standard: 'A.REI.D.11', url: 'https://www.jmap.org/htmlstandard/A.REI.D.11.htm' },
      { name: 'Completing the Square', standard: 'A.SSE.B.3', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Quadratic Formula', standard: 'A.REI.B.4', url: 'https://www.jmap.org/htmlstandard/A.REI.B.4.htm' },
      { name: 'Vertex Form', standard: 'F.IF.C.8', url: 'https://www.jmap.org/htmlstandard/F.IF.C.8.htm' },
    ],
  },
  {
    category: 'FUNCTIONS',
    topics: [
      { name: 'Function Notation', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Domain and Range', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Rate of Change', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Graphing Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Transformations of Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
    ],
  },
  {
    category: 'LINEAR FUNCTIONS',
    topics: [
      { name: 'Slope', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Writing Linear Equations', standard: 'A.CED.A.2', url: 'https://www.jmap.org/htmlstandard/A.CED.A.2.htm' },
      { name: 'Graphing Linear Equations', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Parallel and Perpendicular Lines', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
    ],
  },
  {
    category: 'SYSTEMS OF EQUATIONS',
    topics: [
      { name: 'Solving Systems Graphically', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Solving Systems Algebraically', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Systems of Inequalities', standard: 'A.REI.D.12', url: 'https://www.jmap.org/htmlstandard/A.REI.D.12.htm' },
    ],
  },
  {
    category: 'STATISTICS',
    topics: [
      { name: 'Regression', standard: 'S.ID.B.6', url: 'https://www.jmap.org/htmlstandard/S.ID.B.6.htm' },
      { name: 'Correlation Coefficient', standard: 'S.ID.C.8', url: 'https://www.jmap.org/htmlstandard/S.ID.C.8.htm' },
      { name: 'Residuals', standard: 'S.ID.B.6', url: 'https://www.jmap.org/htmlstandard/S.ID.B.6.htm' },
    ],
  },
];

export const ALGEBRA2_TOPICS: TopicCategory[] = [
  {
    category: 'POLYNOMIAL FUNCTIONS',
    topics: [
      { name: 'Operations with Polynomials', standard: 'A.APR.A.1', url: 'https://www.jmap.org/htmlstandard/A.APR.A.1.htm' },
      { name: 'Polynomial Identities', standard: 'A.APR.C.4', url: 'https://www.jmap.org/htmlstandard/A.APR.C.4.htm' },
      { name: 'Zeros of Polynomials', standard: 'A.APR.B.3', url: 'https://www.jmap.org/htmlstandard/A.APR.B.3.htm' },
      { name: 'Remainder and Factor Theorems', standard: 'A.APR.B.2', url: 'https://www.jmap.org/htmlstandard/A.APR.B.2.htm' },
      { name: 'Polynomial Graphs', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
    ],
  },
  {
    category: 'RATIONAL EXPRESSIONS',
    topics: [
      { name: 'Rational Expressions', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Rational Equations', standard: 'A.REI.A.2', url: 'https://www.jmap.org/htmlstandard/A.REI.A.2.htm' },
      { name: 'Direct and Inverse Variation', standard: 'A.CED.A.2', url: 'https://www.jmap.org/htmlstandard/A.CED.A.2.htm' },
    ],
  },
  {
    category: 'RADICALS AND COMPLEX NUMBERS',
    topics: [
      { name: 'Radicals', standard: 'N.RN.A.2', url: 'https://www.jmap.org/htmlstandard/N.RN.A.2.htm' },
      { name: 'Radical Equations', standard: 'A.REI.A.2', url: 'https://www.jmap.org/htmlstandard/A.REI.A.2.htm' },
      { name: 'Complex Numbers', standard: 'N.CN.A.1', url: 'https://www.jmap.org/htmlstandard/N.CN.A.1.htm' },
      { name: 'Operations with Complex Numbers', standard: 'N.CN.A.2', url: 'https://www.jmap.org/htmlstandard/N.CN.A.2.htm' },
    ],
  },
  {
    category: 'EXPONENTIAL AND LOGARITHMIC FUNCTIONS',
    topics: [
      { name: 'Exponential Functions', standard: 'F.LE.A.2', url: 'https://www.jmap.org/htmlstandard/F.LE.A.2.htm' },
      { name: 'Exponential Equations', standard: 'F.LE.A.4', url: 'https://www.jmap.org/htmlstandard/F.LE.A.4.htm' },
      { name: 'Logarithmic Functions', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Properties of Logarithms', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Exponential Growth and Decay', standard: 'F.LE.A.1', url: 'https://www.jmap.org/htmlstandard/F.LE.A.1.htm' },
    ],
  },
  {
    category: 'TRIGONOMETRIC FUNCTIONS',
    topics: [
      { name: 'Unit Circle', standard: 'F.TF.A.2', url: 'https://www.jmap.org/htmlstandard/F.TF.A.2.htm' },
      { name: 'Trigonometric Functions', standard: 'F.TF.A.1', url: 'https://www.jmap.org/htmlstandard/F.TF.A.1.htm' },
      { name: 'Graphing Trigonometric Functions', standard: 'F.TF.B.5', url: 'https://www.jmap.org/htmlstandard/F.TF.B.5.htm' },
      { name: 'Trigonometric Identities', standard: 'F.TF.C.8', url: 'https://www.jmap.org/htmlstandard/F.TF.C.8.htm' },
      { name: 'Solving Trigonometric Equations', standard: 'F.TF.B.7', url: 'https://www.jmap.org/htmlstandard/F.TF.B.7.htm' },
    ],
  },
  {
    category: 'SEQUENCES AND SERIES',
    topics: [
      { name: 'Arithmetic Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Geometric Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Series', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
    ],
  },
  {
    category: 'PROBABILITY AND STATISTICS',
    topics: [
      { name: 'Probability', standard: 'S.CP.A.1', url: 'https://www.jmap.org/htmlstandard/S.CP.A.1.htm' },
      { name: 'Permutations and Combinations', standard: 'S.CP.B.9', url: 'https://www.jmap.org/htmlstandard/S.CP.B.9.htm' },
      { name: 'Normal Distribution', standard: 'S.ID.A.4', url: 'https://www.jmap.org/htmlstandard/S.ID.A.4.htm' },
    ],
  },
];

export const PRECALCULUS_TOPICS: TopicCategory[] = [
  {
    category: 'FUNCTIONS AND THEIR GRAPHS',
    topics: [
      { name: 'Functions and Function Notation', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Domain and Range', standard: 'F.IF.B.5', url: 'https://www.jmap.org/htmlstandard/F.IF.B.5.htm' },
      { name: 'Transformations of Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
      { name: 'Inverse Functions', standard: 'F.BF.B.4', url: 'https://www.jmap.org/htmlstandard/F.BF.B.4.htm' },
      { name: 'Composition of Functions', standard: 'F.BF.A.1', url: 'https://www.jmap.org/htmlstandard/F.BF.A.1.htm' },
    ],
  },
  {
    category: 'POLYNOMIAL AND RATIONAL FUNCTIONS',
    topics: [
      { name: 'Polynomial Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Zeros of Polynomial Functions', standard: 'A.APR.B.3', url: 'https://www.jmap.org/htmlstandard/A.APR.B.3.htm' },
      { name: 'Rational Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Asymptotes', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Partial Fractions', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
    ],
  },
  {
    category: 'EXPONENTIAL AND LOGARITHMIC FUNCTIONS',
    topics: [
      { name: 'Exponential Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Logarithmic Functions', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Properties of Logarithms', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Exponential and Logarithmic Equations', standard: 'F.LE.A.4', url: 'https://www.jmap.org/htmlstandard/F.LE.A.4.htm' },
    ],
  },
  {
    category: 'TRIGONOMETRY',
    topics: [
      { name: 'Radian and Degree Measure', standard: 'F.TF.A.1', url: 'https://www.jmap.org/htmlstandard/F.TF.A.1.htm' },
      { name: 'Unit Circle', standard: 'F.TF.A.2', url: 'https://www.jmap.org/htmlstandard/F.TF.A.2.htm' },
      { name: 'Trigonometric Functions', standard: 'F.TF.A.2', url: 'https://www.jmap.org/htmlstandard/F.TF.A.2.htm' },
      { name: 'Graphs of Trigonometric Functions', standard: 'F.TF.B.5', url: 'https://www.jmap.org/htmlstandard/F.TF.B.5.htm' },
      { name: 'Inverse Trigonometric Functions', standard: 'F.TF.B.6', url: 'https://www.jmap.org/htmlstandard/F.TF.B.6.htm' },
      { name: 'Trigonometric Identities', standard: 'F.TF.C.8', url: 'https://www.jmap.org/htmlstandard/F.TF.C.8.htm' },
      { name: 'Sum and Difference Formulas', standard: 'F.TF.C.9', url: 'https://www.jmap.org/htmlstandard/F.TF.C.9.htm' },
    ],
  },
  {
    category: 'CONIC SECTIONS',
    topics: [
      { name: 'Circles', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Parabolas', standard: 'G.GPE.A.2', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.2.htm' },
      { name: 'Ellipses', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Hyperbolas', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
    ],
  },
  {
    category: 'VECTORS AND PARAMETRIC EQUATIONS',
    topics: [
      { name: 'Vectors in the Plane', standard: 'N.VM.A.1', url: 'https://www.jmap.org/htmlstandard/N.VM.A.1.htm' },
      { name: 'Vector Operations', standard: 'N.VM.B.4', url: 'https://www.jmap.org/htmlstandard/N.VM.B.4.htm' },
      { name: 'Dot Product', standard: 'N.VM.B.5', url: 'https://www.jmap.org/htmlstandard/N.VM.B.5.htm' },
      { name: 'Parametric Equations', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
    ],
  },
  {
    category: 'LIMITS AND INTRODUCTION TO CALCULUS',
    topics: [
      { name: 'Finding Limits Graphically', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Finding Limits Algebraically', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Continuity', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Introduction to Derivatives', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
    ],
  },
  {
    category: 'SEQUENCES AND SERIES',
    topics: [
      { name: 'Arithmetic Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Geometric Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Infinite Series', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Binomial Theorem', standard: 'A.APR.C.5', url: 'https://www.jmap.org/htmlstandard/A.APR.C.5.htm' },
    ],
  },
];

export const ENGLISH_TOPICS: TopicCategory[] = [
  {
    category: 'READING COMPREHENSION',
    topics: [
      { name: 'Central Idea and Theme', standard: 'RL.11-12.2', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Text Structure and Organization', standard: 'RI.11-12.5', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Author\'s Purpose and Point of View', standard: 'RI.11-12.6', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Inference and Evidence', standard: 'RL.11-12.1', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Vocabulary in Context', standard: 'L.11-12.4', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
    ],
  },
  {
    category: 'LITERARY ANALYSIS',
    topics: [
      { name: 'Characterization', standard: 'RL.11-12.3', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Literary Devices', standard: 'RL.11-12.4', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Symbolism and Allegory', standard: 'RL.11-12.4', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Tone and Mood', standard: 'RL.11-12.4', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Narrative Perspective', standard: 'RL.11-12.6', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
    ],
  },
  {
    category: 'WRITING',
    topics: [
      { name: 'Argumentative Writing', standard: 'W.11-12.1', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Informative/Explanatory Writing', standard: 'W.11-12.2', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Narrative Writing', standard: 'W.11-12.3', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Research Skills', standard: 'W.11-12.7', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Evidence Integration', standard: 'W.11-12.9', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
    ],
  },
  {
    category: 'LANGUAGE AND GRAMMAR',
    topics: [
      { name: 'Sentence Structure', standard: 'L.11-12.3', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Usage and Conventions', standard: 'L.11-12.1', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Punctuation', standard: 'L.11-12.2', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
      { name: 'Word Choice and Style', standard: 'L.11-12.3', url: 'https://www.nysed.gov/curriculum-instruction/english-language-arts-learning-standards' },
    ],
  },
];

export const HISTORY_TOPICS: TopicCategory[] = [
  {
    category: 'US HISTORY',
    topics: [
      { name: 'Colonial Period', standard: 'USH.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'American Revolution', standard: 'USH.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Constitution and New Nation', standard: 'USH.3', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Civil War and Reconstruction', standard: 'USH.4', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Industrialization and Progressivism', standard: 'USH.5', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'World War I and the 1920s', standard: 'USH.6', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Great Depression and New Deal', standard: 'USH.7', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'World War II', standard: 'USH.8', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Cold War Era', standard: 'USH.9', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Civil Rights Movement', standard: 'USH.10', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
    ],
  },
  {
    category: 'GLOBAL HISTORY',
    topics: [
      { name: 'Ancient Civilizations', standard: 'GH.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Classical Civilizations', standard: 'GH.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Post-Classical Era', standard: 'GH.3', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Renaissance and Reformation', standard: 'GH.4', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Age of Exploration', standard: 'GH.5', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Age of Revolutions', standard: 'GH.6', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Imperialism', standard: 'GH.7', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'World Wars', standard: 'GH.8', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Cold War and Decolonization', standard: 'GH.9', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
    ],
  },
  {
    category: 'CIVIC LITERACY',
    topics: [
      { name: 'Constitutional Foundations', standard: 'CIV.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Rights and Responsibilities', standard: 'CIV.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Government Structure', standard: 'CIV.3', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Political Processes', standard: 'CIV.4', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
    ],
  },
  {
    category: 'GEOGRAPHY AND ECONOMICS',
    topics: [
      { name: 'Physical Geography', standard: 'GEO.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Human Geography', standard: 'GEO.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Economic Systems', standard: 'ECON.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
      { name: 'Trade and Globalization', standard: 'ECON.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-framework' },
    ],
  },
];

export const BIOLOGY_TOPICS: TopicCategory[] = [
  {
    category: 'CELLS AND CELL PROCESSES',
    topics: [
      { name: 'Cell Structure and Function', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Cell Organelles', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Cell Membrane and Transport', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Cellular Respiration', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Photosynthesis', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Cell Division - Mitosis', standard: 'LE.2.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Cell Division - Meiosis', standard: 'LE.2.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'GENETICS AND HEREDITY',
    topics: [
      { name: 'DNA Structure and Replication', standard: 'LE.2.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Protein Synthesis', standard: 'LE.2.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mendelian Genetics', standard: 'LE.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Punnett Squares', standard: 'LE.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Genetic Variations', standard: 'LE.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mutations', standard: 'LE.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Genetic Engineering', standard: 'LE.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'EVOLUTION',
    topics: [
      { name: 'Natural Selection', standard: 'LE.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Evidence of Evolution', standard: 'LE.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Adaptation', standard: 'LE.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Speciation', standard: 'LE.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Evolutionary Relationships', standard: 'LE.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ECOLOGY',
    topics: [
      { name: 'Ecosystems and Biomes', standard: 'LE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Food Chains and Webs', standard: 'LE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Energy Flow', standard: 'LE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Biogeochemical Cycles', standard: 'LE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Population Dynamics', standard: 'LE.6.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Symbiotic Relationships', standard: 'LE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Human Impact on Environment', standard: 'LE.7.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'HUMAN BODY SYSTEMS',
    topics: [
      { name: 'Digestive System', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Circulatory System', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Respiratory System', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Nervous System', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Immune System', standard: 'LE.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Reproductive System', standard: 'LE.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Homeostasis', standard: 'LE.5.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'LABORATORY SKILLS',
    topics: [
      { name: 'Microscope Use', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Scientific Method', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Data Analysis', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Laboratory Safety', standard: 'LE.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
];

export const EARTH_SCIENCE_TOPICS: TopicCategory[] = [
  {
    category: 'EARTH IN SPACE',
    topics: [
      { name: 'Solar System', standard: 'NYS.ES.1.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Earth-Moon System', standard: 'NYS.ES.1.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Seasons and Tilt', standard: 'NYS.ES.1.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Phases of the Moon', standard: 'NYS.ES.1.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Eclipses', standard: 'NYS.ES.1.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Stars and Galaxies', standard: 'NYS.ES.1.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'MINERALS AND ROCKS',
    topics: [
      { name: 'Mineral Identification', standard: 'NYS.ES.2.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Rock Cycle', standard: 'NYS.ES.2.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Igneous Rocks', standard: 'NYS.ES.2.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Sedimentary Rocks', standard: 'NYS.ES.2.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Metamorphic Rocks', standard: 'NYS.ES.2.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'PLATE TECTONICS',
    topics: [
      { name: 'Continental Drift', standard: 'NYS.ES.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Plate Boundaries', standard: 'NYS.ES.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Earthquakes', standard: 'NYS.ES.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Volcanoes', standard: 'NYS.ES.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mountain Building', standard: 'NYS.ES.3.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'WEATHERING AND EROSION',
    topics: [
      { name: 'Weathering Types', standard: 'NYS.ES.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Erosion and Deposition', standard: 'NYS.ES.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Soil Formation', standard: 'NYS.ES.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Glaciers', standard: 'NYS.ES.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mass Movement', standard: 'NYS.ES.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ATMOSPHERE AND WEATHER',
    topics: [
      { name: 'Atmospheric Layers', standard: 'NYS.ES.5.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Weather Variables', standard: 'NYS.ES.5.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Air Masses and Fronts', standard: 'NYS.ES.5.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Storms and Severe Weather', standard: 'NYS.ES.5.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Weather Maps', standard: 'NYS.ES.5.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Climate Zones', standard: 'NYS.ES.5.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'WATER CYCLE AND OCEANS',
    topics: [
      { name: 'Water Cycle', standard: 'NYS.ES.6.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Groundwater', standard: 'NYS.ES.6.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Ocean Currents', standard: 'NYS.ES.6.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Tides', standard: 'NYS.ES.6.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Ocean Floor Features', standard: 'NYS.ES.6.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'EARTH HISTORY',
    topics: [
      { name: 'Geologic Time Scale', standard: 'NYS.ES.7.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Fossils and Index Fossils', standard: 'NYS.ES.7.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Relative Dating', standard: 'NYS.ES.7.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Absolute Dating', standard: 'NYS.ES.7.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mass Extinctions', standard: 'NYS.ES.7.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'EARTH REFERENCE TABLES',
    topics: [
      { name: 'Reading Topographic Maps', standard: 'NYS.ES.8.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Using the ESRT', standard: 'NYS.ES.8.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Latitude and Longitude', standard: 'NYS.ES.8.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Coordinate Systems', standard: 'NYS.ES.8.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
];

export const CHEMISTRY_TOPICS: TopicCategory[] = [
  {
    category: 'MATTER AND ENERGY',
    topics: [
      { name: 'Classification of Matter', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Physical and Chemical Properties', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'States of Matter', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Phase Changes', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Heat and Temperature', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Calorimetry', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ATOMIC STRUCTURE',
    topics: [
      { name: 'Atomic Models', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Subatomic Particles', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electron Configuration', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Isotopes and Atomic Mass', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Nuclear Chemistry', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Radioactive Decay', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Half-Life', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'PERIODIC TABLE',
    topics: [
      { name: 'Periodic Trends', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Groups and Periods', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Metals, Nonmetals, and Metalloids', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electronegativity', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Ionization Energy', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Atomic Radius', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'CHEMICAL BONDING',
    topics: [
      { name: 'Ionic Bonding', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Covalent Bonding', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Metallic Bonding', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Lewis Dot Structures', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Molecular Geometry', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Polarity', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Intermolecular Forces', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'CHEMICAL FORMULAS AND EQUATIONS',
    topics: [
      { name: 'Naming Compounds', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Writing Chemical Formulas', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Balancing Chemical Equations', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Types of Chemical Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Synthesis Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Decomposition Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Single and Double Replacement', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'STOICHIOMETRY',
    topics: [
      { name: 'Mole Concept', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Molar Mass', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Percent Composition', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Empirical and Molecular Formulas', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mole-to-Mole Calculations', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mass-to-Mass Calculations', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Limiting Reagent', standard: 'PS.3.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'SOLUTIONS AND SOLUBILITY',
    topics: [
      { name: 'Types of Solutions', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Concentration and Molarity', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Solubility Rules', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Dilution', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Colligative Properties', standard: 'PS.3.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ACIDS AND BASES',
    topics: [
      { name: 'Properties of Acids and Bases', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'pH Scale', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Neutralization Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Titration', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Buffers', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'KINETICS AND EQUILIBRIUM',
    topics: [
      { name: 'Reaction Rate', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Factors Affecting Rate', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Activation Energy', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Chemical Equilibrium', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Le Chatelier\'s Principle', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Equilibrium Constants', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'OXIDATION-REDUCTION',
    topics: [
      { name: 'Oxidation States', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Redox Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Balancing Redox Equations', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electrochemical Cells', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electrolysis', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ORGANIC CHEMISTRY',
    topics: [
      { name: 'Hydrocarbons', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Functional Groups', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Isomers', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Organic Reactions', standard: 'PS.3.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Polymers', standard: 'PS.3.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
];

export const PHYSICS_TOPICS: TopicCategory[] = [
  {
    category: 'MECHANICS - KINEMATICS',
    topics: [
      { name: 'Distance and Displacement', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Speed and Velocity', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Acceleration', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Motion Graphs', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Free Fall', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Projectile Motion', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Kinematic Equations', standard: 'PS.4.1', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'MECHANICS - DYNAMICS',
    topics: [
      { name: 'Newton\'s First Law', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Newton\'s Second Law', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Newton\'s Third Law', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Force Diagrams', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Friction', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Weight and Normal Force', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Inclined Planes', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'CIRCULAR MOTION AND GRAVITY',
    topics: [
      { name: 'Uniform Circular Motion', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Centripetal Force', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Universal Gravitation', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Gravitational Fields', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Satellite Motion', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'MOMENTUM AND IMPULSE',
    topics: [
      { name: 'Momentum', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Impulse', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Impulse-Momentum Theorem', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Conservation of Momentum', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Elastic Collisions', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Inelastic Collisions', standard: 'PS.4.2', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'WORK, ENERGY, AND POWER',
    topics: [
      { name: 'Work', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Kinetic Energy', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Potential Energy', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Conservation of Energy', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Work-Energy Theorem', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Power', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Simple Machines', standard: 'PS.4.3', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'ELECTROSTATICS',
    topics: [
      { name: 'Electric Charge', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Coulomb\'s Law', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electric Fields', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electric Potential', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Conductors and Insulators', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Charging Methods', standard: 'PS.4.4', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'CIRCUITS',
    topics: [
      { name: 'Current and Voltage', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Resistance and Ohm\'s Law', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Series Circuits', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Parallel Circuits', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Combination Circuits', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Power in Circuits', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Circuit Analysis', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'MAGNETISM',
    topics: [
      { name: 'Magnetic Fields', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Magnetic Force on Charges', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Magnetic Force on Current', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Electromagnetic Induction', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Motors and Generators', standard: 'PS.4.5', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'WAVES',
    topics: [
      { name: 'Wave Properties', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Wave Types', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Wave Equation', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Reflection', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Refraction', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Diffraction', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Interference', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Standing Waves', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Doppler Effect', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'SOUND',
    topics: [
      { name: 'Sound Waves', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Sound Speed', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Sound Intensity', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Resonance', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Beats', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'LIGHT AND OPTICS',
    topics: [
      { name: 'Electromagnetic Spectrum', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Ray Diagrams', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Plane Mirrors', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Curved Mirrors', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Snell\'s Law', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Lenses', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Total Internal Reflection', standard: 'PS.4.6', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
  {
    category: 'MODERN PHYSICS',
    topics: [
      { name: 'Photoelectric Effect', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Wave-Particle Duality', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Energy Levels', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Photon Energy', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'De Broglie Wavelength', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Special Relativity', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
      { name: 'Mass-Energy Equivalence', standard: 'PS.4.7', url: 'https://www.nysed.gov/curriculum-instruction/science-learning-standards' },
    ],
  },
];

// Financial Math Topics - Aligned with NYS Standards and NGPF (Next Gen Personal Finance)
export const FINANCIAL_MATH_TOPICS: TopicCategory[] = [
  {
    category: 'FIRST JOB & INCOME',
    topics: [
      { name: 'Calculating Gross Pay', standard: 'NGPF.1.1', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'Understanding Pay Stubs', standard: 'NGPF.1.2', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'Net Pay vs Gross Pay', standard: 'NGPF.1.3', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'Overtime Pay Calculations', standard: 'NGPF.1.4', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'Tips and Commission', standard: 'NGPF.1.5', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'Part-Time Job Budgeting', standard: 'NGPF.1.6', url: 'https://www.ngpf.org/curriculum/earning-income/' },
      { name: 'W-4 Form and Withholdings', standard: 'NGPF.1.7', url: 'https://www.ngpf.org/curriculum/earning-income/' },
    ],
  },
  {
    category: 'FEDERAL INCOME TAXES',
    topics: [
      { name: 'Tax Brackets and Marginal Rates', standard: 'NGPF.2.1', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Filing Status (Single, MFJ, HOH)', standard: 'NGPF.2.2', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Standard vs Itemized Deductions', standard: 'NGPF.2.3', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Calculating Taxable Income', standard: 'NGPF.2.4', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Federal Tax Calculations', standard: 'NGPF.2.5', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Effective vs Marginal Tax Rate', standard: 'NGPF.2.6', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'W-2 Forms and Tax Returns', standard: 'NGPF.2.7', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Tax Credits vs Deductions', standard: 'NGPF.2.8', url: 'https://www.ngpf.org/curriculum/taxes/' },
    ],
  },
  {
    category: 'STATE & PAYROLL TAXES',
    topics: [
      { name: 'NYS Income Tax Brackets', standard: 'NYS.FIN.1', url: 'https://www.tax.ny.gov/pit/file/tax_tables.htm' },
      { name: 'FICA Taxes (Social Security & Medicare)', standard: 'NGPF.2.9', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'Self-Employment Tax', standard: 'NGPF.2.10', url: 'https://www.ngpf.org/curriculum/taxes/' },
      { name: 'NYS and NYC Local Taxes', standard: 'NYS.FIN.2', url: 'https://www.tax.ny.gov/pit/file/tax_tables.htm' },
    ],
  },
  {
    category: 'CREDIT FUNDAMENTALS',
    topics: [
      { name: 'What is Credit?', standard: 'NGPF.3.1', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Reports and Bureaus', standard: 'NGPF.3.2', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Score Components', standard: 'NGPF.3.3', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Payment History Impact (35%)', standard: 'NGPF.3.4', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Utilization (30%)', standard: 'NGPF.3.5', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit History Length (15%)', standard: 'NGPF.3.6', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Mix (10%)', standard: 'NGPF.3.7', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'New Credit Inquiries (10%)', standard: 'NGPF.3.8', url: 'https://www.ngpf.org/curriculum/credit/' },
    ],
  },
  {
    category: 'CREDIT SCORE CALCULATIONS',
    topics: [
      { name: 'Calculating Credit Utilization Ratio', standard: 'NGPF.3.9', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Late Payment Score Impact', standard: 'NGPF.3.10', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Ideal Utilization (Under 30%)', standard: 'NGPF.3.11', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Score Recovery Strategies', standard: 'NGPF.3.12', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Score Ranges (300-850)', standard: 'NGPF.3.13', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Debt-to-Credit Ratio Analysis', standard: 'NGPF.3.14', url: 'https://www.ngpf.org/curriculum/credit/' },
    ],
  },
  {
    category: 'CREDIT CARDS & INTEREST',
    topics: [
      { name: 'Annual Percentage Rate (APR)', standard: 'NGPF.3.15', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Minimum Payment Traps', standard: 'NGPF.3.16', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Interest Charge Calculations', standard: 'NGPF.3.17', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Credit Card Fees', standard: 'NGPF.3.18', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Secured vs Unsecured Cards', standard: 'NGPF.3.19', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Building Credit Responsibly', standard: 'NGPF.3.20', url: 'https://www.ngpf.org/curriculum/credit/' },
    ],
  },
  {
    category: 'FIRST APARTMENT & HOUSING',
    topics: [
      { name: 'Rent Affordability (30% Rule)', standard: 'NGPF.4.1', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Security Deposits and First/Last Month', standard: 'NGPF.4.2', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Renter\'s Insurance', standard: 'NGPF.4.3', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Utility Budgeting', standard: 'NGPF.4.4', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Lease Agreement Terms', standard: 'NGPF.4.5', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Credit Score Requirements for Renting', standard: 'NGPF.4.6', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Move-In Cost Calculations', standard: 'NGPF.4.7', url: 'https://www.ngpf.org/curriculum/managing-money/' },
    ],
  },
  {
    category: 'BUDGETING & MONEY MANAGEMENT',
    topics: [
      { name: 'Creating a Monthly Budget', standard: 'NGPF.5.1', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: '50/30/20 Budget Rule', standard: 'NGPF.5.2', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Fixed vs Variable Expenses', standard: 'NGPF.5.3', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Emergency Fund Calculations', standard: 'NGPF.5.4', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Opportunity Cost', standard: 'NGPF.5.5', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Tracking Spending', standard: 'NGPF.5.6', url: 'https://www.ngpf.org/curriculum/managing-money/' },
    ],
  },
  {
    category: 'CAR FINANCING & LOANS',
    topics: [
      { name: 'Calculating Monthly Car Payments', standard: 'NGPF.6.1', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Loan vs Lease Comparison', standard: 'NGPF.6.2', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Down Payment and Trade-In', standard: 'NGPF.6.3', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'APR and Total Interest Paid', standard: 'NGPF.6.4', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Depreciation Calculations', standard: 'NGPF.6.5', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Car Insurance Requirements', standard: 'NGPF.6.6', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Total Cost of Car Ownership', standard: 'NGPF.6.7', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
    ],
  },
  {
    category: 'LEASING CALCULATIONS',
    topics: [
      { name: 'MSRP and Residual Value', standard: 'NGPF.6.8', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Money Factor to APR Conversion', standard: 'NGPF.6.9', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Monthly Lease Payment Formula', standard: 'NGPF.6.10', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Capitalized Cost and Fees', standard: 'NGPF.6.11', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Mileage Limits and Penalties', standard: 'NGPF.6.12', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
    ],
  },
  {
    category: 'RELATIONSHIPS & SHARED FINANCES',
    topics: [
      { name: 'Splitting Expenses with Roommates', standard: 'NGPF.7.1', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Joint vs Separate Accounts', standard: 'NGPF.7.2', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Financial Communication in Relationships', standard: 'NGPF.7.3', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Co-signing Loans: Risks and Responsibilities', standard: 'NGPF.7.4', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Authorized User on Credit Cards', standard: 'NGPF.7.5', url: 'https://www.ngpf.org/curriculum/credit/' },
      { name: 'Wedding and Event Budgeting', standard: 'NGPF.7.6', url: 'https://www.ngpf.org/curriculum/managing-money/' },
    ],
  },
  {
    category: 'SAVING & INVESTING BASICS',
    topics: [
      { name: 'Simple vs Compound Interest', standard: 'NGPF.8.1', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Rule of 72', standard: 'NGPF.8.2', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'High-Yield Savings Accounts', standard: 'NGPF.8.3', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: '401(k) and Employer Match', standard: 'NGPF.8.4', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Roth IRA Contributions', standard: 'NGPF.8.5', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Time Value of Money', standard: 'NGPF.8.6', url: 'https://www.ngpf.org/curriculum/investing/' },
    ],
  },
  {
    category: 'HOME OWNERSHIP',
    topics: [
      { name: 'Additional Costs: Fees', standard: 'FIN.10.1', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Additional Costs: Escrow', standard: 'FIN.10.2', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Total Housing Payments', standard: 'FIN.10.3', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Paying Off a Mortgage', standard: 'FIN.10.4', url: 'https://www.ngpf.org/curriculum/managing-money/' },
      { name: 'Home Ownership Wrap-Up', standard: 'FIN.10.5', url: 'https://www.ngpf.org/curriculum/managing-money/' },
    ],
  },
  {
    category: 'INSURANCE AND RETIREMENT',
    topics: [
      { name: 'Car Insurance Premiums', standard: 'FIN.11.1', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Suggested Premium', standard: 'FIN.11.2', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Property and Renters Insurance', standard: 'FIN.11.3', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Life Insurance', standard: 'FIN.11.4', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Calculating Life Insurance Premiums', standard: 'FIN.11.5', url: 'https://www.ngpf.org/curriculum/insurance/' },
      { name: 'Retirement Accounts', standard: 'FIN.11.6', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Insurance and Retirement Wrap-Up', standard: 'FIN.11.7', url: 'https://www.ngpf.org/curriculum/insurance/' },
    ],
  },
  {
    category: 'INVESTMENTS',
    topics: [
      { name: 'CDs (Certificates of Deposit)', standard: 'FIN.12.1', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Annuities', standard: 'FIN.12.2', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Bonds', standard: 'FIN.12.3', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Stocks', standard: 'FIN.12.4', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'The Stock Market', standard: 'FIN.12.5', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Prediction', standard: 'FIN.12.6', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Periodic Investment', standard: 'FIN.12.7', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Retirement and Periodic Investment', standard: 'FIN.12.8', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Individual Net Worth', standard: 'FIN.12.9', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Investments Wrap-Up', standard: 'FIN.12.10', url: 'https://www.ngpf.org/curriculum/investing/' },
    ],
  },
  {
    category: 'INVESTMENT BONDS',
    topics: [
      { name: 'Bond Fundamentals', standard: 'FIN.14.1', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Bond Face Value and Purchase Price', standard: 'FIN.14.2', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Coupon Rate and Payment Calculations', standard: 'FIN.14.3', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Annual vs Semiannual Coupon Payments', standard: 'FIN.14.4', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Total Bond Payments Over Time', standard: 'FIN.14.5', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Bond Total Return on Investment', standard: 'FIN.14.6', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Current Yield Calculations', standard: 'FIN.14.7', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Yield to Maturity (YTM)', standard: 'FIN.14.8', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Premium vs Discount Bonds', standard: 'FIN.14.9', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Government vs Corporate Bonds', standard: 'FIN.14.10', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Bond Maturity and Interest Rate Risk', standard: 'FIN.14.11', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Municipal Bond Tax Advantages', standard: 'FIN.14.12', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Comparing Bond Investments', standard: 'FIN.14.13', url: 'https://www.ngpf.org/curriculum/investing/' },
      { name: 'Zero-Coupon Bonds', standard: 'FIN.14.14', url: 'https://www.ngpf.org/curriculum/investing/' },
    ],
  },
  {
    category: 'BUSINESS',
    topics: [
      { name: 'Cost and Revenue Functions', standard: 'FIN.13.1', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Profit', standard: 'FIN.13.2', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Solving Systems of Equations', standard: 'FIN.13.3', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Matrices', standard: 'FIN.13.4', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Factors Affecting Business', standard: 'FIN.13.5', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Maximizing Revenue or Minimizing Cost', standard: 'FIN.13.6', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Running a Business', standard: 'FIN.13.7', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Storage, Inventory, and Other Business Concerns', standard: 'FIN.13.8', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
      { name: 'Business Wrap-Up', standard: 'FIN.13.9', url: 'https://www.ngpf.org/curriculum/consumer-skills/' },
    ],
  },
  {
    category: 'ECONOMIC INDICATORS',
    topics: [
      { name: 'GDP Calculation', standard: 'NYS.ECON.1', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-learning-standards' },
      { name: 'GDP Growth Rate', standard: 'NYS.ECON.2', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-learning-standards' },
      { name: 'Nominal vs Real GDP', standard: 'NYS.ECON.3', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-learning-standards' },
      { name: 'Inflation and CPI', standard: 'NYS.ECON.4', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-learning-standards' },
      { name: 'Unemployment Rate', standard: 'NYS.ECON.5', url: 'https://www.nysed.gov/curriculum-instruction/social-studies-learning-standards' },
    ],
  },
  {
    category: 'STUDENT LOANS & EDUCATION',
    topics: [
      { name: 'FAFSA and Financial Aid', standard: 'NGPF.9.1', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
      { name: 'Federal vs Private Loans', standard: 'NGPF.9.2', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
      { name: 'Loan Repayment Plans', standard: 'NGPF.9.3', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
      { name: 'Interest Accrual While in School', standard: 'NGPF.9.4', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
      { name: 'Total Cost of College', standard: 'NGPF.9.5', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
      { name: 'Scholarships and Grants', standard: 'NGPF.9.6', url: 'https://www.ngpf.org/curriculum/paying-for-college/' },
    ],
  },
];

// NYS LOTE (Languages Other Than English) - Checkpoint A, B, and C aligned
export const LOTE_TOPICS: TopicCategory[] = [
  {
    category: 'INTERPRETIVE COMMUNICATION - LISTENING',
    topics: [
      { name: 'Understanding Greetings & Introductions', standard: 'NYS.LOTE.1a.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Following Classroom Instructions', standard: 'NYS.LOTE.1a.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Comprehending Weather Reports', standard: 'NYS.LOTE.1a.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Understanding Phone Conversations', standard: 'NYS.LOTE.1b.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Following News Broadcasts', standard: 'NYS.LOTE.1b.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Listening to Song Lyrics', standard: 'NYS.LOTE.1b.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'INTERPRETIVE COMMUNICATION - READING',
    topics: [
      { name: 'Reading Restaurant Menus', standard: 'NYS.LOTE.2a.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Understanding Store Signs & Advertisements', standard: 'NYS.LOTE.2a.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Reading Social Media Posts', standard: 'NYS.LOTE.2a.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Interpreting Job Listings', standard: 'NYS.LOTE.2b.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Reading Apartment Rental Ads', standard: 'NYS.LOTE.2b.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Understanding Product Labels', standard: 'NYS.LOTE.2b.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Reading News Articles', standard: 'NYS.LOTE.2c.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'INTERPERSONAL COMMUNICATION',
    topics: [
      { name: 'Introducing Yourself', standard: 'NYS.LOTE.3a.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Ordering Food at a Restaurant', standard: 'NYS.LOTE.3a.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Asking for Directions', standard: 'NYS.LOTE.3a.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Shopping Conversations', standard: 'NYS.LOTE.3b.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Job Interview Role Play', standard: 'NYS.LOTE.3b.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Making Plans with Friends', standard: 'NYS.LOTE.3b.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Discussing Current Events', standard: 'NYS.LOTE.3c.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Negotiating & Problem Solving', standard: 'NYS.LOTE.3c.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'PRESENTATIONAL COMMUNICATION - SPEAKING',
    topics: [
      { name: 'Describing Your Family', standard: 'NYS.LOTE.4a.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Presenting About Your School', standard: 'NYS.LOTE.4a.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Describing Daily Routines', standard: 'NYS.LOTE.4a.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Giving Oral Reports on Cultural Topics', standard: 'NYS.LOTE.4b.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Presenting Future Career Plans', standard: 'NYS.LOTE.4b.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Debating Social Issues', standard: 'NYS.LOTE.4c.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'PRESENTATIONAL COMMUNICATION - WRITING',
    topics: [
      { name: 'Writing Personal Introductions', standard: 'NYS.LOTE.5a.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Completing Job Applications', standard: 'NYS.LOTE.5a.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Writing Emails to Friends', standard: 'NYS.LOTE.5a.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Composing Cover Letters', standard: 'NYS.LOTE.5b.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Writing Formal Complaints', standard: 'NYS.LOTE.5b.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Creating Social Media Content', standard: 'NYS.LOTE.5b.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Writing Persuasive Essays', standard: 'NYS.LOTE.5c.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'FIRST JOB SCENARIOS',
    topics: [
      { name: 'Job Application Vocabulary', standard: 'NYS.LOTE.6.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Interview Questions & Responses', standard: 'NYS.LOTE.6.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Understanding Work Schedules', standard: 'NYS.LOTE.6.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Workplace Communication', standard: 'NYS.LOTE.6.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Calling in Sick / Requesting Time Off', standard: 'NYS.LOTE.6.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Understanding Paystubs', standard: 'NYS.LOTE.6.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'FIRST APARTMENT SCENARIOS',
    topics: [
      { name: 'Apartment Hunting Vocabulary', standard: 'NYS.LOTE.7.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Reading Lease Agreements', standard: 'NYS.LOTE.7.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Communicating with Landlords', standard: 'NYS.LOTE.7.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Reporting Maintenance Issues', standard: 'NYS.LOTE.7.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Setting Up Utilities', standard: 'NYS.LOTE.7.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Roommate Agreements', standard: 'NYS.LOTE.7.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'RELATIONSHIP SCENARIOS',
    topics: [
      { name: 'Making Friends & Small Talk', standard: 'NYS.LOTE.8.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Expressing Feelings & Emotions', standard: 'NYS.LOTE.8.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Planning Dates & Activities', standard: 'NYS.LOTE.8.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Meeting Family Members', standard: 'NYS.LOTE.8.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Resolving Conflicts', standard: 'NYS.LOTE.8.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Cultural Dating Customs', standard: 'NYS.LOTE.8.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'CULTURAL PRACTICES & PRODUCTS',
    topics: [
      { name: 'Traditional Holidays & Celebrations', standard: 'NYS.LOTE.9.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Food & Cuisine Traditions', standard: 'NYS.LOTE.9.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Music & Dance', standard: 'NYS.LOTE.9.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Art & Literature', standard: 'NYS.LOTE.9.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Famous Figures & Historical Events', standard: 'NYS.LOTE.9.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Sports & Recreation', standard: 'NYS.LOTE.9.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'CULTURAL PERSPECTIVES',
    topics: [
      { name: 'Family Structures & Values', standard: 'NYS.LOTE.10.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Education Systems', standard: 'NYS.LOTE.10.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Work-Life Balance', standard: 'NYS.LOTE.10.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Social Etiquette & Manners', standard: 'NYS.LOTE.10.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Attitudes Toward Time', standard: 'NYS.LOTE.10.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Comparing Cultural Perspectives', standard: 'NYS.LOTE.10.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'GRAMMAR & LANGUAGE STRUCTURES',
    topics: [
      { name: 'Present Tense Conjugations', standard: 'NYS.LOTE.11.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Past Tense Narration', standard: 'NYS.LOTE.11.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Future Tense Expressions', standard: 'NYS.LOTE.11.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Question Formation', standard: 'NYS.LOTE.11.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Subjunctive Mood', standard: 'NYS.LOTE.11.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Conditional Expressions', standard: 'NYS.LOTE.11.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Object Pronouns', standard: 'NYS.LOTE.11.7', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
  {
    category: 'VOCABULARY THEMES',
    topics: [
      { name: 'Numbers, Dates & Time', standard: 'NYS.LOTE.12.1', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Colors & Physical Descriptions', standard: 'NYS.LOTE.12.2', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Clothing & Fashion', standard: 'NYS.LOTE.12.3', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Food & Beverages', standard: 'NYS.LOTE.12.4', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Transportation', standard: 'NYS.LOTE.12.5', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Health & Body Parts', standard: 'NYS.LOTE.12.6', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
      { name: 'Technology & Social Media', standard: 'NYS.LOTE.12.7', url: 'https://www.nysed.gov/curriculum-instruction/languages-other-english-lote' },
    ],
  },
];

export const GOVERNMENT_TOPICS: TopicCategory[] = [
  {
    category: 'FOUNDATIONS OF GOVERNMENT',
    topics: [
      { name: 'Purposes of Government', standard: 'NYS.SS.9-12.CIV.1', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Types of Government', standard: 'NYS.SS.9-12.CIV.2', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Constitutional Principles', standard: 'NYS.SS.9-12.CIV.3', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Federalism', standard: 'NYS.SS.9-12.CIV.4', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Separation of Powers', standard: 'NYS.SS.9-12.CIV.5', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Checks and Balances', standard: 'NYS.SS.9-12.CIV.6', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'LEGISLATIVE BRANCH',
    topics: [
      { name: 'Structure of Congress', standard: 'NYS.SS.9-12.CIV.7', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Powers of Congress', standard: 'NYS.SS.9-12.CIV.8', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'How a Bill Becomes Law', standard: 'NYS.SS.9-12.CIV.9', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Congressional Committees', standard: 'NYS.SS.9-12.CIV.10', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Representation and Redistricting', standard: 'NYS.SS.9-12.CIV.11', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'EXECUTIVE BRANCH',
    topics: [
      { name: 'Presidential Powers', standard: 'NYS.SS.9-12.CIV.12', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Executive Orders', standard: 'NYS.SS.9-12.CIV.13', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'The Cabinet and Federal Agencies', standard: 'NYS.SS.9-12.CIV.14', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Presidential Succession', standard: 'NYS.SS.9-12.CIV.15', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Electoral College', standard: 'NYS.SS.9-12.CIV.16', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'JUDICIAL BRANCH',
    topics: [
      { name: 'Structure of Federal Courts', standard: 'NYS.SS.9-12.CIV.17', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Supreme Court Powers', standard: 'NYS.SS.9-12.CIV.18', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Judicial Review', standard: 'NYS.SS.9-12.CIV.19', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Landmark Supreme Court Cases', standard: 'NYS.SS.9-12.CIV.20', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Rights of the Accused', standard: 'NYS.SS.9-12.CIV.21', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'RIGHTS AND RESPONSIBILITIES',
    topics: [
      { name: 'Bill of Rights', standard: 'NYS.SS.9-12.CIV.22', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Civil Liberties', standard: 'NYS.SS.9-12.CIV.23', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Civil Rights', standard: 'NYS.SS.9-12.CIV.24', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Citizenship and Naturalization', standard: 'NYS.SS.9-12.CIV.25', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Civic Participation', standard: 'NYS.SS.9-12.CIV.26', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'POLITICAL PROCESS',
    topics: [
      { name: 'Political Parties', standard: 'NYS.SS.9-12.CIV.27', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Elections and Voting', standard: 'NYS.SS.9-12.CIV.28', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Interest Groups and Lobbying', standard: 'NYS.SS.9-12.CIV.29', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Media and Public Opinion', standard: 'NYS.SS.9-12.CIV.30', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Campaign Finance', standard: 'NYS.SS.9-12.CIV.31', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
];

export const ECONOMICS_TOPICS: TopicCategory[] = [
  {
    category: 'BASIC ECONOMIC CONCEPTS',
    topics: [
      { name: 'Scarcity and Choice', standard: 'NYS.SS.9-12.ECO.1', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Opportunity Cost', standard: 'NYS.SS.9-12.ECO.2', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Factors of Production', standard: 'NYS.SS.9-12.ECO.3', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Economic Systems', standard: 'NYS.SS.9-12.ECO.4', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Circular Flow Model', standard: 'NYS.SS.9-12.ECO.5', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'SUPPLY AND DEMAND',
    topics: [
      { name: 'Law of Demand', standard: 'NYS.SS.9-12.ECO.6', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Law of Supply', standard: 'NYS.SS.9-12.ECO.7', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Market Equilibrium', standard: 'NYS.SS.9-12.ECO.8', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Price Elasticity', standard: 'NYS.SS.9-12.ECO.9', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Shifts in Supply and Demand', standard: 'NYS.SS.9-12.ECO.10', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'MARKET STRUCTURES',
    topics: [
      { name: 'Perfect Competition', standard: 'NYS.SS.9-12.ECO.11', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Monopoly', standard: 'NYS.SS.9-12.ECO.12', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Oligopoly', standard: 'NYS.SS.9-12.ECO.13', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Monopolistic Competition', standard: 'NYS.SS.9-12.ECO.14', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Market Failures', standard: 'NYS.SS.9-12.ECO.15', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'MACROECONOMICS',
    topics: [
      { name: 'Gross Domestic Product (GDP)', standard: 'NYS.SS.9-12.ECO.16', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Inflation and Deflation', standard: 'NYS.SS.9-12.ECO.17', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Unemployment', standard: 'NYS.SS.9-12.ECO.18', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Business Cycle', standard: 'NYS.SS.9-12.ECO.19', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Economic Indicators', standard: 'NYS.SS.9-12.ECO.20', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'MONEY AND BANKING',
    topics: [
      { name: 'Functions of Money', standard: 'NYS.SS.9-12.ECO.21', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Federal Reserve System', standard: 'NYS.SS.9-12.ECO.22', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Monetary Policy', standard: 'NYS.SS.9-12.ECO.23', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Interest Rates', standard: 'NYS.SS.9-12.ECO.24', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Banking System', standard: 'NYS.SS.9-12.ECO.25', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'GOVERNMENT AND THE ECONOMY',
    topics: [
      { name: 'Fiscal Policy', standard: 'NYS.SS.9-12.ECO.26', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Taxation', standard: 'NYS.SS.9-12.ECO.27', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Government Spending', standard: 'NYS.SS.9-12.ECO.28', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'National Debt', standard: 'NYS.SS.9-12.ECO.29', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Trade Policy', standard: 'NYS.SS.9-12.ECO.30', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'INTERNATIONAL ECONOMICS',
    topics: [
      { name: 'International Trade', standard: 'NYS.SS.9-12.ECO.31', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Comparative Advantage', standard: 'NYS.SS.9-12.ECO.32', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Exchange Rates', standard: 'NYS.SS.9-12.ECO.33', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Trade Barriers', standard: 'NYS.SS.9-12.ECO.34', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Globalization', standard: 'NYS.SS.9-12.ECO.35', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
  {
    category: 'PERSONAL FINANCE',
    topics: [
      { name: 'Budgeting', standard: 'NYS.SS.9-12.ECO.36', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Saving and Investing', standard: 'NYS.SS.9-12.ECO.37', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Credit and Debt', standard: 'NYS.SS.9-12.ECO.38', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Insurance', standard: 'NYS.SS.9-12.ECO.39', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
      { name: 'Consumer Rights', standard: 'NYS.SS.9-12.ECO.40', url: 'https://www.nysed.gov/curriculum-instruction/k-12-social-studies' },
    ],
  },
];

export const STATISTICS_TOPICS: TopicCategory[] = [
  {
    category: 'S-ID — INTERPRETING CATEGORICAL AND QUANTITATIVE DATA',
    topics: [
      { name: 'Represent data with plots on the real number line: dot plots, histograms, box plots', standard: 'S-ID.A.1', secondaryStandard: 'CUNY BMCC MAT 150: construct and interpret simple statistical charts', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Compare center and spread of two or more data sets', standard: 'S-ID.A.2', secondaryStandard: 'CUNY BMCC MAT 150: calculate key statistics and parameters', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Interpret differences in shape, center and spread; account for outliers', standard: 'S-ID.A.3', secondaryStandard: 'CUNY BMCC MAT 150: calculate key statistics and parameters', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Normal distribution and the empirical rule', standard: 'S-ID.A.4', secondaryStandard: 'CUNY BMCC MAT 150: probabilities from continuous distributions', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Two-way frequency tables: joint, marginal and conditional relative frequencies', standard: 'S-ID.B.5', secondaryStandard: 'CUNY BMCC MAT 150: construct and interpret simple statistical charts', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Scatter plots; fit a function to data', standard: 'S-ID.B.6', secondaryStandard: 'CUNY BMCC MAT 150: concepts in regression and correlation', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Interpret slope and intercept of a linear model in context', standard: 'S-ID.C.7', secondaryStandard: 'CUNY BMCC MAT 150: concepts in regression and correlation', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Compute and interpret the correlation coefficient', standard: 'S-ID.C.8', secondaryStandard: 'CUNY BMCC MAT 150: concepts in regression and correlation', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Distinguish between correlation and causation', standard: 'S-ID.C.9', secondaryStandard: 'CUNY BMCC MAT 150: concepts in regression and correlation', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
    ],
  },
  {
    category: 'S-IC — MAKING INFERENCES AND JUSTIFYING CONCLUSIONS',
    topics: [
      { name: 'Statistics as a process for making inferences about a population', standard: 'S-IC.A.1', secondaryStandard: 'CUNY BMCC MAT 150: define the vocabulary, terminology and symbols of statistics', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Evaluate a model by simulation', standard: 'S-IC.A.2', secondaryStandard: 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Surveys, experiments and observational studies; the role of randomization', standard: 'S-IC.B.3', secondaryStandard: 'CUNY BMCC MAT 150: plan an experiment or survey and gather data', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Estimate a population mean or proportion; margin of error', standard: 'S-IC.B.4', secondaryStandard: 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Compare two treatments; decide whether differences are significant', standard: 'S-IC.B.5', secondaryStandard: 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Evaluate reports based on data', standard: 'S-IC.B.6', secondaryStandard: 'CUNY BMCC MAT 150: draw conclusions from data', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
    ],
  },
  {
    category: 'S-CP — CONDITIONAL PROBABILITY AND THE RULES OF PROBABILITY',
    topics: [
      { name: 'Describe events as subsets of a sample space', standard: 'S-CP.A.1', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Independence and the multiplication rule', standard: 'S-CP.A.2', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Conditional probability and independence', standard: 'S-CP.A.3', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Construct and interpret two-way tables of data', standard: 'S-CP.A.4', secondaryStandard: 'CUNY BMCC MAT 150: construct and interpret simple statistical charts', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Conditional probability and independence in everyday situations', standard: 'S-CP.A.5', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Conditional probability as a fraction of outcomes', standard: 'S-CP.B.6', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Apply the addition rule', standard: 'S-CP.B.7', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
    ],
  },
  {
    category: 'S-MD — USING PROBABILITY TO MAKE DECISIONS',
    topics: [
      { name: 'Define a random variable; graph its probability distribution', standard: 'S-MD.A.1', secondaryStandard: 'CUNY BMCC MAT 150: probabilities from continuous distributions', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Calculate the expected value of a random variable', standard: 'S-MD.A.2', secondaryStandard: 'CUNY BMCC MAT 150: calculate key statistics and parameters', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Expected value under a theoretical probability distribution', standard: 'S-MD.A.3', secondaryStandard: 'CUNY BMCC MAT 150: probabilities from continuous distributions', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Weigh outcomes and make decisions under uncertainty', standard: 'S-MD.B.5', secondaryStandard: 'CUNY BMCC MAT 150: draw conclusions from data', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Use probability to make fair decisions', standard: 'S-MD.B.6', secondaryStandard: 'CUNY BMCC MAT 150: calculate elementary probabilities', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
      { name: 'Analyze decisions and strategies using probability concepts', standard: 'S-MD.B.7', secondaryStandard: 'CUNY BMCC MAT 150: draw conclusions from data', url: 'https://www.nysed.gov/curriculum-instruction/high-school-mathematics-standards' },
    ],
  },
];

export const NYS_SUBJECTS: Subject[] = [
  {
    id: 'geometry',
    name: 'Geometry',
    shortName: 'GEO',
    categories: GEOMETRY_TOPICS,
  },
  {
    id: 'algebra1',
    name: 'Algebra I',
    shortName: 'ALG1',
    categories: ALGEBRA1_TOPICS,
  },
  {
    id: 'algebra2',
    name: 'Algebra II',
    shortName: 'ALG2',
    categories: ALGEBRA2_TOPICS,
  },
  {
    id: 'precalculus',
    name: 'Precalculus',
    shortName: 'PRE',
    categories: PRECALCULUS_TOPICS,
  },
  {
    id: 'statistics',
    name: 'High School Statistics',
    shortName: 'STAT',
    categories: STATISTICS_TOPICS,
  },
  {
    id: 'english',
    name: 'English',
    shortName: 'ENG',
    categories: ENGLISH_TOPICS,
  },
  {
    id: 'history',
    name: 'History',
    shortName: 'HIST',
    categories: HISTORY_TOPICS,
  },
  {
    id: 'biology',
    name: 'Living Environment',
    shortName: 'LE',
    categories: BIOLOGY_TOPICS,
  },
  {
    id: 'earthscience',
    name: 'Earth Science',
    shortName: 'ES',
    categories: EARTH_SCIENCE_TOPICS,
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    shortName: 'CHEM',
    categories: CHEMISTRY_TOPICS,
  },
  {
    id: 'physics',
    name: 'Physics',
    shortName: 'PHYS',
    categories: PHYSICS_TOPICS,
  },
  {
    id: 'financialmath',
    name: 'Financial Math',
    shortName: 'FIN',
    categories: FINANCIAL_MATH_TOPICS,
  },
  {
    id: 'lote',
    name: 'Languages Other Than English (LOTE)',
    shortName: 'LOTE',
    categories: LOTE_TOPICS,
  },
  {
    id: 'government',
    name: 'Government',
    shortName: 'GOV',
    categories: GOVERNMENT_TOPICS,
  },
  {
    id: 'economics',
    name: 'Economics',
    shortName: 'ECON',
    categories: ECONOMICS_TOPICS,
  },
];

// Helper to get all topics across all subjects
export function getAllTopics(): { subject: string; category: string; topic: JMAPTopic }[] {
  const allTopics: { subject: string; category: string; topic: JMAPTopic }[] = [];
  
  NYS_SUBJECTS.forEach(subject => {
    subject.categories.forEach(category => {
      category.topics.forEach(topic => {
        allTopics.push({
          subject: subject.name,
          category: category.category,
          topic,
        });
      });
    });
  });
  
  return allTopics;
}

// Helper to search topics
export function searchTopics(query: string): { subject: string; category: string; topic: JMAPTopic }[] {
  if (!query.trim()) return [];
  
  const lowerQuery = query.toLowerCase();
  return getAllTopics().filter(item => 
    item.topic.name.toLowerCase().includes(lowerQuery) ||
    item.topic.standard.toLowerCase().includes(lowerQuery) ||
    item.category.toLowerCase().includes(lowerQuery) ||
    item.subject.toLowerCase().includes(lowerQuery)
  );
}
