import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Upload, X, Plus, Trash2, ExternalLink, Loader2, Sparkles, Bot, User, Search, Copy, Check } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { handleApiError, checkResponseForApiError } from '@/lib/apiErrorHandler';

interface Topic {
  id: string;
  name: string;
}

interface RubricStep {
  description: string;
  points: number;
}

interface GradeLevel {
  letter: string;
  label: string;
  minPercent: number;
  maxPercent: number;
}

const DANIELSON_SCALE: GradeLevel[] = [
  { letter: 'A+', label: 'Exceptional', minPercent: 97, maxPercent: 100 },
  { letter: 'A', label: 'Excellent', minPercent: 93, maxPercent: 96 },
  { letter: 'A-', label: 'Very Good', minPercent: 90, maxPercent: 92 },
  { letter: 'B+', label: 'Good', minPercent: 87, maxPercent: 89 },
  { letter: 'B', label: 'Above Average', minPercent: 83, maxPercent: 86 },
  { letter: 'B-', label: 'Satisfactory', minPercent: 80, maxPercent: 82 },
  { letter: 'C+', label: 'Adequate', minPercent: 77, maxPercent: 79 },
  { letter: 'C', label: 'Fair', minPercent: 73, maxPercent: 76 },
  { letter: 'C-', label: 'Passing', minPercent: 65, maxPercent: 72 },
  { letter: 'D+', label: 'Below Average', minPercent: 62, maxPercent: 64 },
  { letter: 'D', label: 'Poor', minPercent: 58, maxPercent: 61 },
  { letter: 'D-', label: 'Minimal', minPercent: 55, maxPercent: 57 },
];

// Geometry JMAP Topics with standards
const GEOMETRY_JMAP_TOPICS = [
  {
    category: 'TOOLS OF GEOMETRY',
    topics: [
      { name: 'Planes', standard: 'G.CO.A.1', url: 'https://www.jmap.org/htmlstandard/G.CO.A.1.htm' },
      { name: 'Solids', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
      { name: 'Density Problems', standard: 'G.MG.A.2', url: 'https://www.jmap.org/htmlstandard/G.MG.A.2.htm' },
      { name: 'Geometric Modeling in Design', standard: 'G.MG.A.3', url: 'https://www.jmap.org/htmlstandard/G.MG.A.3.htm' },
      { name: 'Circumference and Area Formulas', standard: 'G.GMD.A.1', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.1.htm' },
      { name: 'Perimeter', standard: 'G.GMD.A.1', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.1.htm' },
      { name: 'Area of Polygons', standard: 'G.GMD.A.1', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.1.htm' },
      { name: 'Surface Area', standard: 'G.MG.A.3', url: 'https://www.jmap.org/Worksheets/G.MG.A.3.SurfaceArea.pdf' },
      { name: 'Surface Area of Prisms and Cylinders', standard: 'G.MG.A.3', url: 'https://www.jmap.org/Worksheets/G.MG.A.3.SurfaceArea.pdf' },
      { name: 'Surface Area of Pyramids and Cones', standard: 'G.MG.A.3', url: 'https://www.jmap.org/Worksheets/G.MG.A.3.SurfaceArea.pdf' },
      { name: 'Surface Area of Spheres', standard: 'G.MG.A.3', url: 'https://www.jmap.org/Worksheets/G.MG.A.3.SurfaceArea.pdf' },
      { name: 'Volume Formulas', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Prisms and Cylinders', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Pyramids and Cones', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Volume of Spheres', standard: 'G.GMD.A.3', url: 'https://www.jmap.org/htmlstandard/G.GMD.A.3.htm' },
      { name: 'Cross-Sections of Three-Dimensional Objects', standard: 'G.GMD.B.4', url: 'https://www.jmap.org/htmlstandard/G.GMD.B.4.htm' },
      { name: 'Composite Figures', standard: 'G.MG.A.1', url: 'https://www.jmap.org/htmlstandard/G.MG.A.1.htm' },
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
      { name: 'Triangle Proportionality Theorem', standard: 'G.SRT.B.4', url: 'https://www.jmap.org/htmlstandard/G.SRT.B.4.htm' },
      { name: 'Triangle Similarity', standard: 'G.SRT.A.2', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.2.htm' },
      { name: 'Triangle Similarity Proofs', standard: 'G.SRT.A.3', url: 'https://www.jmap.org/htmlstandard/G.SRT.A.3.htm' },
      { name: 'Special Right Triangles', standard: 'G.SRT.C.8', url: 'https://www.jmap.org/htmlstandard/G.SRT.C.8.htm' },
      { name: 'Triangle Inequality Theorem', standard: 'G.CO.C.10', url: 'https://www.jmap.org/htmlstandard/G.CO.C.10.htm' },
      { name: 'Triangle Congruence Criteria', standard: 'G.CO.B.8', url: 'https://www.jmap.org/htmlstandard/G.CO.B.8.htm' },
      { name: 'Congruence and Rigid Motions', standard: 'G.CO.B.6', url: 'https://www.jmap.org/htmlstandard/G.CO.B.6.htm' },
      { name: 'Using Congruence in Proofs', standard: 'G.CO.B.7', url: 'https://www.jmap.org/htmlstandard/G.CO.B.7.htm' },
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
      { name: 'Perimeter and Area using Coordinates', standard: 'G.GPE.B.7', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.7.htm' },
    ],
  },
  {
    category: 'CONICS',
    topics: [
      { name: 'Equations of Circles', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Parabola Focus and Directrix', standard: 'G.GPE.A.2', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.2.htm' },
      { name: 'Similar Circles', standard: 'G.C.A.1', url: 'https://www.jmap.org/htmlstandard/G.C.A.1.htm' },
      { name: 'Chords, Secants, and Tangents', standard: 'G.C.A.2', url: 'https://www.jmap.org/htmlstandard/G.C.A.2.htm' },
      { name: 'Inscribed Angles', standard: 'G.C.A.2', url: 'https://www.jmap.org/htmlstandard/G.C.A.2.htm' },
      { name: 'Arc Length and Sector Area', standard: 'G.C.B.5', url: 'https://www.jmap.org/htmlstandard/G.C.B.5.htm' },
      { name: 'Inscribed and Circumscribed Circles', standard: 'G.C.A.3', url: 'https://www.jmap.org/htmlstandard/G.C.A.3.htm' },
      { name: 'Constructing Tangent Lines', standard: 'G.C.A.4', url: 'https://www.jmap.org/htmlstandard/G.C.A.4.htm' },
    ],
  },
  {
    category: 'TRANSFORMATIONS',
    topics: [
      { name: 'Transformation Definitions', standard: 'G.CO.A.2', url: 'https://www.jmap.org/htmlstandard/G.CO.A.2.htm' },
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
      { name: 'Area of Triangle using Trigonometry', standard: 'G.SRT.D.9', url: 'https://www.jmap.org/htmlstandard/G.SRT.D.9.htm' },
      { name: 'Law of Sines and Cosines Applications', standard: 'G.SRT.D.11', url: 'https://www.jmap.org/htmlstandard/G.SRT.D.11.htm' },
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
];

// Algebra I JMAP Topics with standards
const ALGEBRA1_JMAP_TOPICS = [
  {
    category: 'EXPRESSIONS AND EQUATIONS',
    topics: [
      { name: 'Interpreting Expressions', standard: 'A.SSE.A.1', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.1.htm' },
      { name: 'Interpreting Parts of Expressions', standard: 'A.SSE.A.1a', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.1.htm' },
      { name: 'Interpreting Complicated Expressions', standard: 'A.SSE.A.1b', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.1.htm' },
      { name: 'Using Structure to Rewrite', standard: 'A.SSE.A.2', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.2.htm' },
      { name: 'Factoring Polynomials', standard: 'A.SSE.A.2', url: 'https://www.jmap.org/htmlstandard/A.SSE.A.2.htm' },
      { name: 'Operations with Polynomials', standard: 'A.APR.A.1', url: 'https://www.jmap.org/htmlstandard/A.APR.A.1.htm' },
      { name: 'Solving Linear Equations', standard: 'A.REI.B.3', url: 'https://www.jmap.org/htmlstandard/A.REI.B.3.htm' },
      { name: 'Solving Linear Inequalities', standard: 'A.REI.B.3', url: 'https://www.jmap.org/htmlstandard/A.REI.B.3.htm' },
      { name: 'Literal Equations', standard: 'A.CED.A.4', url: 'https://www.jmap.org/htmlstandard/A.CED.A.4.htm' },
    ],
  },
  {
    category: 'CREATING EQUATIONS',
    topics: [
      { name: 'Creating Equations in One Variable', standard: 'A.CED.A.1', url: 'https://www.jmap.org/htmlstandard/A.CED.A.1.htm' },
      { name: 'Creating Equations in Two Variables', standard: 'A.CED.A.2', url: 'https://www.jmap.org/htmlstandard/A.CED.A.2.htm' },
      { name: 'Creating Inequalities', standard: 'A.CED.A.1', url: 'https://www.jmap.org/htmlstandard/A.CED.A.1.htm' },
      { name: 'Representing Constraints', standard: 'A.CED.A.3', url: 'https://www.jmap.org/htmlstandard/A.CED.A.3.htm' },
      { name: 'Rearranging Formulas', standard: 'A.CED.A.4', url: 'https://www.jmap.org/htmlstandard/A.CED.A.4.htm' },
      { name: 'Modeling with Equations', standard: 'A.CED.A.1', url: 'https://www.jmap.org/htmlstandard/A.CED.A.1.htm' },
    ],
  },
  {
    category: 'QUADRATICS',
    topics: [
      { name: 'Writing Quadratics in Equivalent Forms', standard: 'A.SSE.B.3', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Factoring Quadratics', standard: 'A.SSE.B.3a', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Solving Quadratics by Factoring', standard: 'A.SSE.B.3', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Solving Quadratics by Graphing', standard: 'A.REI.D.11', url: 'https://www.jmap.org/htmlstandard/A.REI.D.11.htm' },
      { name: 'Completing the Square', standard: 'A.SSE.B.3b', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
      { name: 'Quadratic Formula', standard: 'A.REI.B.4', url: 'https://www.jmap.org/htmlstandard/A.REI.B.4.htm' },
      { name: 'Deriving the Quadratic Formula', standard: 'A.REI.B.4a', url: 'https://www.jmap.org/htmlstandard/A.REI.B.4.htm' },
      { name: 'Using the Quadratic Formula', standard: 'A.REI.B.4b', url: 'https://www.jmap.org/htmlstandard/A.REI.B.4.htm' },
      { name: 'Vertex Form', standard: 'F.IF.C.8', url: 'https://www.jmap.org/htmlstandard/F.IF.C.8.htm' },
      { name: 'Properties of Exponents', standard: 'A.SSE.B.3c', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.3.htm' },
    ],
  },
  {
    category: 'FUNCTIONS',
    topics: [
      { name: 'Function Notation', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Evaluating Functions', standard: 'F.IF.A.2', url: 'https://www.jmap.org/htmlstandard/F.IF.A.2.htm' },
      { name: 'Domain and Range', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Sequences as Functions', standard: 'F.IF.A.3', url: 'https://www.jmap.org/htmlstandard/F.IF.A.3.htm' },
      { name: 'Interpreting Key Features', standard: 'F.IF.B.4', url: 'https://www.jmap.org/htmlstandard/F.IF.B.4.htm' },
      { name: 'Relating Domain to Graph', standard: 'F.IF.B.5', url: 'https://www.jmap.org/htmlstandard/F.IF.B.5.htm' },
      { name: 'Rate of Change', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Graphing Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Comparing Functions', standard: 'F.IF.C.9', url: 'https://www.jmap.org/htmlstandard/F.IF.C.9.htm' },
      { name: 'Transformations of Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
      { name: 'Building Functions', standard: 'F.BF.A.1', url: 'https://www.jmap.org/htmlstandard/F.BF.A.1.htm' },
    ],
  },
  {
    category: 'LINEAR FUNCTIONS',
    topics: [
      { name: 'Slope', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Writing Linear Equations', standard: 'A.CED.A.2', url: 'https://www.jmap.org/htmlstandard/A.CED.A.2.htm' },
      { name: 'Graphing Linear Equations', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Parallel and Perpendicular Lines', standard: 'G.GPE.B.5', url: 'https://www.jmap.org/htmlstandard/G.GPE.B.5.htm' },
      { name: 'Linear vs Exponential Growth', standard: 'F.LE.A.1', url: 'https://www.jmap.org/htmlstandard/F.LE.A.1.htm' },
      { name: 'Constructing Linear Functions', standard: 'F.LE.A.2', url: 'https://www.jmap.org/htmlstandard/F.LE.A.2.htm' },
      { name: 'Interpreting Linear Models', standard: 'S.ID.C.7', url: 'https://www.jmap.org/htmlstandard/S.ID.C.7.htm' },
    ],
  },
  {
    category: 'SYSTEMS OF EQUATIONS',
    topics: [
      { name: 'Solving Systems Graphically', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Solving Systems by Substitution', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Solving Systems by Elimination', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Proving Equivalence of Systems', standard: 'A.REI.C.5', url: 'https://www.jmap.org/htmlstandard/A.REI.C.5.htm' },
      { name: 'Systems of Inequalities', standard: 'A.REI.D.12', url: 'https://www.jmap.org/htmlstandard/A.REI.D.12.htm' },
      { name: 'Solutions as Intersections', standard: 'A.REI.D.11', url: 'https://www.jmap.org/htmlstandard/A.REI.D.11.htm' },
      { name: 'Graphing Solution Sets', standard: 'A.REI.D.10', url: 'https://www.jmap.org/htmlstandard/A.REI.D.10.htm' },
    ],
  },
  {
    category: 'STATISTICS',
    topics: [
      { name: 'Representing Data', standard: 'S.ID.A.1', url: 'https://www.jmap.org/htmlstandard/S.ID.A.1.htm' },
      { name: 'Comparing Data Sets', standard: 'S.ID.A.2', url: 'https://www.jmap.org/htmlstandard/S.ID.A.2.htm' },
      { name: 'Interpreting Data Distributions', standard: 'S.ID.A.3', url: 'https://www.jmap.org/htmlstandard/S.ID.A.3.htm' },
      { name: 'Two-Way Frequency Tables', standard: 'S.ID.B.5', url: 'https://www.jmap.org/htmlstandard/S.ID.B.5.htm' },
      { name: 'Regression', standard: 'S.ID.B.6', url: 'https://www.jmap.org/htmlstandard/S.ID.B.6.htm' },
      { name: 'Fitting Functions to Data', standard: 'S.ID.B.6a', url: 'https://www.jmap.org/htmlstandard/S.ID.B.6.htm' },
      { name: 'Correlation Coefficient', standard: 'S.ID.C.8', url: 'https://www.jmap.org/htmlstandard/S.ID.C.8.htm' },
      { name: 'Residuals', standard: 'S.ID.B.6b', url: 'https://www.jmap.org/htmlstandard/S.ID.B.6.htm' },
      { name: 'Distinguishing Correlation and Causation', standard: 'S.ID.C.9', url: 'https://www.jmap.org/htmlstandard/S.ID.C.9.htm' },
    ],
  },
];

// Algebra II JMAP Topics with standards
const ALGEBRA2_JMAP_TOPICS = [
  {
    category: 'POLYNOMIAL FUNCTIONS',
    topics: [
      { name: 'Operations with Polynomials', standard: 'A.APR.A.1', url: 'https://www.jmap.org/htmlstandard/A.APR.A.1.htm' },
      { name: 'Polynomial Identities', standard: 'A.APR.C.4', url: 'https://www.jmap.org/htmlstandard/A.APR.C.4.htm' },
      { name: 'Zeros of Polynomials', standard: 'A.APR.B.3', url: 'https://www.jmap.org/htmlstandard/A.APR.B.3.htm' },
      { name: 'Remainder and Factor Theorems', standard: 'A.APR.B.2', url: 'https://www.jmap.org/htmlstandard/A.APR.B.2.htm' },
      { name: 'Polynomial Graphs', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Binomial Theorem', standard: 'A.APR.C.5', url: 'https://www.jmap.org/htmlstandard/A.APR.C.5.htm' },
    ],
  },
  {
    category: 'RATIONAL EXPRESSIONS',
    topics: [
      { name: 'Rational Expressions', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Rational Equations', standard: 'A.REI.A.2', url: 'https://www.jmap.org/htmlstandard/A.REI.A.2.htm' },
      { name: 'Direct and Inverse Variation', standard: 'A.CED.A.2', url: 'https://www.jmap.org/htmlstandard/A.CED.A.2.htm' },
      { name: 'Rewriting Rational Expressions', standard: 'A.APR.D.7', url: 'https://www.jmap.org/htmlstandard/A.APR.D.7.htm' },
    ],
  },
  {
    category: 'RADICALS AND COMPLEX NUMBERS',
    topics: [
      { name: 'Radicals', standard: 'N.RN.A.2', url: 'https://www.jmap.org/htmlstandard/N.RN.A.2.htm' },
      { name: 'Rational Exponents', standard: 'N.RN.A.1', url: 'https://www.jmap.org/htmlstandard/N.RN.A.1.htm' },
      { name: 'Radical Equations', standard: 'A.REI.A.2', url: 'https://www.jmap.org/htmlstandard/A.REI.A.2.htm' },
      { name: 'Complex Numbers', standard: 'N.CN.A.1', url: 'https://www.jmap.org/htmlstandard/N.CN.A.1.htm' },
      { name: 'Operations with Complex Numbers', standard: 'N.CN.A.2', url: 'https://www.jmap.org/htmlstandard/N.CN.A.2.htm' },
      { name: 'Complex Solutions to Quadratics', standard: 'N.CN.C.7', url: 'https://www.jmap.org/htmlstandard/N.CN.C.7.htm' },
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
      { name: 'Comparing Linear and Exponential', standard: 'F.LE.A.3', url: 'https://www.jmap.org/htmlstandard/F.LE.A.3.htm' },
    ],
  },
  {
    category: 'FUNCTIONS AND TRANSFORMATIONS',
    topics: [
      { name: 'Function Notation and Evaluation', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Domain and Range', standard: 'F.IF.A.2', url: 'https://www.jmap.org/htmlstandard/F.IF.A.2.htm' },
      { name: 'Interpreting Functions', standard: 'F.IF.B.4', url: 'https://www.jmap.org/htmlstandard/F.IF.B.4.htm' },
      { name: 'Relating Domain to Graph', standard: 'F.IF.B.5', url: 'https://www.jmap.org/htmlstandard/F.IF.B.5.htm' },
      { name: 'Average Rate of Change', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Analyzing Functions from Graphs', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Comparing Functions', standard: 'F.IF.C.9', url: 'https://www.jmap.org/htmlstandard/F.IF.C.9.htm' },
      { name: 'Building Functions', standard: 'F.BF.A.1', url: 'https://www.jmap.org/htmlstandard/F.BF.A.1.htm' },
      { name: 'Transformations of Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
      { name: 'Inverse Functions', standard: 'F.BF.B.4', url: 'https://www.jmap.org/htmlstandard/F.BF.B.4.htm' },
    ],
  },
  {
    category: 'EQUATIONS AND INEQUALITIES',
    topics: [
      { name: 'Solving Equations', standard: 'A.REI.A.1', url: 'https://www.jmap.org/htmlstandard/A.REI.A.1.htm' },
      { name: 'Solving Radical and Rational Equations', standard: 'A.REI.A.2', url: 'https://www.jmap.org/htmlstandard/A.REI.A.2.htm' },
      { name: 'Systems of Linear Equations', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Systems with Three Variables', standard: 'A.REI.C.6', url: 'https://www.jmap.org/htmlstandard/A.REI.C.6.htm' },
      { name: 'Linear-Quadratic Systems', standard: 'A.REI.C.7', url: 'https://www.jmap.org/htmlstandard/A.REI.C.7.htm' },
      { name: 'Graphing Inequalities', standard: 'A.REI.D.12', url: 'https://www.jmap.org/htmlstandard/A.REI.D.12.htm' },
      { name: 'Solutions as Intersections', standard: 'A.REI.D.11', url: 'https://www.jmap.org/htmlstandard/A.REI.D.11.htm' },
    ],
  },
  {
    category: 'TRIGONOMETRIC FUNCTIONS',
    topics: [
      { name: 'Unit Circle', standard: 'F.TF.A.2', url: 'https://www.jmap.org/htmlstandard/F.TF.A.2.htm' },
      { name: 'Radian Measure', standard: 'F.TF.A.1', url: 'https://www.jmap.org/htmlstandard/F.TF.A.1.htm' },
      { name: 'Trigonometric Functions', standard: 'F.TF.A.2', url: 'https://www.jmap.org/htmlstandard/F.TF.A.2.htm' },
      { name: 'Graphing Trigonometric Functions', standard: 'F.TF.B.5', url: 'https://www.jmap.org/htmlstandard/F.TF.B.5.htm' },
      { name: 'Modeling with Trigonometric Functions', standard: 'F.TF.B.5', url: 'https://www.jmap.org/htmlstandard/F.TF.B.5.htm' },
      { name: 'Trigonometric Identities', standard: 'F.TF.C.8', url: 'https://www.jmap.org/htmlstandard/F.TF.C.8.htm' },
      { name: 'Solving Trigonometric Equations', standard: 'F.TF.B.7', url: 'https://www.jmap.org/htmlstandard/F.TF.B.7.htm' },
      { name: 'Reciprocal Trigonometric Functions', standard: 'F.TF.A.3', url: 'https://www.jmap.org/htmlstandard/F.TF.A.3.htm' },
      { name: 'Inverse Trigonometric Functions', standard: 'F.TF.A.4', url: 'https://www.jmap.org/htmlstandard/F.TF.A.4.htm' },
    ],
  },
  {
    category: 'SEQUENCES AND SERIES',
    topics: [
      { name: 'Arithmetic Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Geometric Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Series', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Sigma Notation', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Recursive Formulas', standard: 'F.IF.A.3', url: 'https://www.jmap.org/htmlstandard/F.IF.A.3.htm' },
    ],
  },
  {
    category: 'PROBABILITY AND STATISTICS',
    topics: [
      { name: 'Probability', standard: 'S.CP.A.1', url: 'https://www.jmap.org/htmlstandard/S.CP.A.1.htm' },
      { name: 'Conditional Probability', standard: 'S.CP.A.3', url: 'https://www.jmap.org/htmlstandard/S.CP.A.3.htm' },
      { name: 'Independent Events', standard: 'S.CP.A.2', url: 'https://www.jmap.org/htmlstandard/S.CP.A.2.htm' },
      { name: 'Probability Rules', standard: 'S.CP.B.7', url: 'https://www.jmap.org/htmlstandard/S.CP.B.7.htm' },
      { name: 'Permutations and Combinations', standard: 'S.CP.B.9', url: 'https://www.jmap.org/htmlstandard/S.CP.B.9.htm' },
      { name: 'Normal Distribution', standard: 'S.ID.A.4', url: 'https://www.jmap.org/htmlstandard/S.ID.A.4.htm' },
      { name: 'Statistical Inference', standard: 'S.IC.A.1', url: 'https://www.jmap.org/htmlstandard/S.IC.A.1.htm' },
      { name: 'Margin of Error', standard: 'S.IC.B.4', url: 'https://www.jmap.org/htmlstandard/S.IC.B.4.htm' },
    ],
  },
];

// Precalculus JMAP Topics with standards
const PRECALCULUS_JMAP_TOPICS = [
  {
    category: 'FUNCTIONS AND THEIR GRAPHS',
    topics: [
      { name: 'Functions and Function Notation', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Domain and Range', standard: 'F.IF.B.5', url: 'https://www.jmap.org/htmlstandard/F.IF.B.5.htm' },
      { name: 'Transformations of Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
      { name: 'Inverse Functions', standard: 'F.BF.B.4', url: 'https://www.jmap.org/htmlstandard/F.BF.B.4.htm' },
      { name: 'Composition of Functions', standard: 'F.BF.A.1', url: 'https://www.jmap.org/htmlstandard/F.BF.A.1.htm' },
      { name: 'Piecewise Functions', standard: 'F.IF.C.7b', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Even and Odd Functions', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
      { name: 'End Behavior of Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Function Symmetry', standard: 'F.BF.B.3', url: 'https://www.jmap.org/htmlstandard/F.BF.B.3.htm' },
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
      { name: 'Polynomial Long Division', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Synthetic Division', standard: 'A.APR.B.2', url: 'https://www.jmap.org/htmlstandard/A.APR.B.2.htm' },
      { name: 'Rational Root Theorem', standard: 'A.APR.B.3', url: 'https://www.jmap.org/htmlstandard/A.APR.B.3.htm' },
      { name: 'Descartes Rule of Signs', standard: 'A.APR.B.3', url: 'https://www.jmap.org/htmlstandard/A.APR.B.3.htm' },
    ],
  },
  {
    category: 'EXPONENTIAL AND LOGARITHMIC FUNCTIONS',
    topics: [
      { name: 'Exponential Functions', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Logarithmic Functions', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Properties of Logarithms', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Exponential and Logarithmic Equations', standard: 'F.LE.A.4', url: 'https://www.jmap.org/htmlstandard/F.LE.A.4.htm' },
      { name: 'Natural Logarithm', standard: 'F.BF.B.5', url: 'https://www.jmap.org/htmlstandard/F.BF.B.5.htm' },
      { name: 'Exponential Growth and Decay', standard: 'F.LE.A.1c', url: 'https://www.jmap.org/htmlstandard/F.LE.A.1.htm' },
      { name: 'Compound Interest', standard: 'F.LE.A.2', url: 'https://www.jmap.org/htmlstandard/F.LE.A.2.htm' },
      { name: 'Logistic Growth', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
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
      { name: 'Double Angle Formulas', standard: 'F.TF.C.9', url: 'https://www.jmap.org/htmlstandard/F.TF.C.9.htm' },
      { name: 'Half Angle Formulas', standard: 'F.TF.C.9', url: 'https://www.jmap.org/htmlstandard/F.TF.C.9.htm' },
      { name: 'Product-to-Sum Formulas', standard: 'F.TF.C.9', url: 'https://www.jmap.org/htmlstandard/F.TF.C.9.htm' },
      { name: 'Sum-to-Product Formulas', standard: 'F.TF.C.9', url: 'https://www.jmap.org/htmlstandard/F.TF.C.9.htm' },
      { name: 'Solving Trigonometric Equations', standard: 'F.TF.B.7', url: 'https://www.jmap.org/htmlstandard/F.TF.B.7.htm' },
      { name: 'Verifying Trigonometric Identities', standard: 'F.TF.C.8', url: 'https://www.jmap.org/htmlstandard/F.TF.C.8.htm' },
      { name: 'Amplitude, Period, and Phase Shift', standard: 'F.TF.B.5', url: 'https://www.jmap.org/htmlstandard/F.TF.B.5.htm' },
    ],
  },
  {
    category: 'CONIC SECTIONS',
    topics: [
      { name: 'Circles', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Parabolas', standard: 'G.GPE.A.2', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.2.htm' },
      { name: 'Ellipses', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Hyperbolas', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Identifying Conic Sections', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Eccentricity', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Foci and Directrix', standard: 'G.GPE.A.2', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.2.htm' },
      { name: 'Conics in Standard Form', standard: 'G.GPE.A.1', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.1.htm' },
      { name: 'Rotated Conics', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
      { name: 'Conics in Polar Form', standard: 'G.GPE.A.3', url: 'https://www.jmap.org/htmlstandard/G.GPE.A.3.htm' },
    ],
  },
  {
    category: 'VECTORS AND PARAMETRIC EQUATIONS',
    topics: [
      { name: 'Vectors in the Plane', standard: 'N.VM.A.1', url: 'https://www.jmap.org/htmlstandard/N.VM.A.1.htm' },
      { name: 'Vector Operations', standard: 'N.VM.B.4', url: 'https://www.jmap.org/htmlstandard/N.VM.B.4.htm' },
      { name: 'Dot Product', standard: 'N.VM.B.5', url: 'https://www.jmap.org/htmlstandard/N.VM.B.5.htm' },
      { name: 'Parametric Equations', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Vector Magnitude and Direction', standard: 'N.VM.A.1', url: 'https://www.jmap.org/htmlstandard/N.VM.A.1.htm' },
      { name: 'Unit Vectors', standard: 'N.VM.A.2', url: 'https://www.jmap.org/htmlstandard/N.VM.A.2.htm' },
      { name: 'Vector Components', standard: 'N.VM.A.3', url: 'https://www.jmap.org/htmlstandard/N.VM.A.3.htm' },
      { name: 'Vector Addition and Subtraction', standard: 'N.VM.B.4a', url: 'https://www.jmap.org/htmlstandard/N.VM.B.4.htm' },
      { name: 'Scalar Multiplication', standard: 'N.VM.B.4b', url: 'https://www.jmap.org/htmlstandard/N.VM.B.4.htm' },
      { name: 'Angle Between Vectors', standard: 'N.VM.B.5a', url: 'https://www.jmap.org/htmlstandard/N.VM.B.5.htm' },
      { name: 'Vector Projections', standard: 'N.VM.B.5b', url: 'https://www.jmap.org/htmlstandard/N.VM.B.5.htm' },
      { name: 'Cross Product', standard: 'N.VM.C.12', url: 'https://www.jmap.org/htmlstandard/N.VM.C.12.htm' },
      { name: 'Vectors in Three Dimensions', standard: 'N.VM.A.3', url: 'https://www.jmap.org/htmlstandard/N.VM.A.3.htm' },
      { name: 'Parametric Curves', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Eliminating Parameters', standard: 'A.REI.A.1', url: 'https://www.jmap.org/htmlstandard/A.REI.A.1.htm' },
    ],
  },
  {
    category: 'POLAR COORDINATES',
    topics: [
      { name: 'Polar Coordinate System', standard: 'N.CN.B.4', url: 'https://www.jmap.org/htmlstandard/N.CN.B.4.htm' },
      { name: 'Converting Polar and Rectangular', standard: 'N.CN.B.4', url: 'https://www.jmap.org/htmlstandard/N.CN.B.4.htm' },
      { name: 'Graphing Polar Equations', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Polar Roses', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Limaçons', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Cardioids', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Lemniscates', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Spirals', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Polar Form of Complex Numbers', standard: 'N.CN.B.4', url: 'https://www.jmap.org/htmlstandard/N.CN.B.4.htm' },
      { name: 'DeMoivre Theorem', standard: 'N.CN.B.5', url: 'https://www.jmap.org/htmlstandard/N.CN.B.5.htm' },
      { name: 'Roots of Complex Numbers', standard: 'N.CN.B.6', url: 'https://www.jmap.org/htmlstandard/N.CN.B.6.htm' },
    ],
  },
  {
    category: 'LIMITS AND INTRODUCTION TO CALCULUS',
    topics: [
      { name: 'Finding Limits Graphically', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Finding Limits Algebraically', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Continuity', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Introduction to Derivatives', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'One-Sided Limits', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Limits at Infinity', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Infinite Limits', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Properties of Limits', standard: 'A.APR.D.6', url: 'https://www.jmap.org/htmlstandard/A.APR.D.6.htm' },
      { name: 'Squeeze Theorem', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
      { name: 'Types of Discontinuities', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Intermediate Value Theorem', standard: 'F.IF.A.1', url: 'https://www.jmap.org/htmlstandard/F.IF.A.1.htm' },
      { name: 'Difference Quotient', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Instantaneous Rate of Change', standard: 'F.IF.B.6', url: 'https://www.jmap.org/htmlstandard/F.IF.B.6.htm' },
      { name: 'Tangent Lines', standard: 'G.C.A.4', url: 'https://www.jmap.org/htmlstandard/G.C.A.4.htm' },
      { name: 'Area Under a Curve', standard: 'F.IF.C.7', url: 'https://www.jmap.org/htmlstandard/F.IF.C.7.htm' },
    ],
  },
  {
    category: 'SEQUENCES AND SERIES',
    topics: [
      { name: 'Arithmetic Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Geometric Sequences', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Infinite Series', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Binomial Theorem', standard: 'A.APR.C.5', url: 'https://www.jmap.org/htmlstandard/A.APR.C.5.htm' },
      { name: 'Sigma Notation', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Partial Sums', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Convergence and Divergence', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Geometric Series', standard: 'A.SSE.B.4', url: 'https://www.jmap.org/htmlstandard/A.SSE.B.4.htm' },
      { name: 'Recursive Formulas', standard: 'F.IF.A.3', url: 'https://www.jmap.org/htmlstandard/F.IF.A.3.htm' },
      { name: 'Explicit Formulas', standard: 'F.BF.A.2', url: 'https://www.jmap.org/htmlstandard/F.BF.A.2.htm' },
      { name: 'Pascal Triangle', standard: 'A.APR.C.5', url: 'https://www.jmap.org/htmlstandard/A.APR.C.5.htm' },
    ],
  },
  {
    category: 'MATRICES',
    topics: [
      { name: 'Matrix Operations', standard: 'N.VM.C.7', url: 'https://www.jmap.org/htmlstandard/N.VM.C.7.htm' },
      { name: 'Matrix Addition and Subtraction', standard: 'N.VM.C.7', url: 'https://www.jmap.org/htmlstandard/N.VM.C.7.htm' },
      { name: 'Scalar Multiplication of Matrices', standard: 'N.VM.C.7', url: 'https://www.jmap.org/htmlstandard/N.VM.C.7.htm' },
      { name: 'Matrix Multiplication', standard: 'N.VM.C.8', url: 'https://www.jmap.org/htmlstandard/N.VM.C.8.htm' },
      { name: 'Determinants', standard: 'N.VM.C.10', url: 'https://www.jmap.org/htmlstandard/N.VM.C.10.htm' },
      { name: 'Inverse Matrices', standard: 'N.VM.C.10', url: 'https://www.jmap.org/htmlstandard/N.VM.C.10.htm' },
      { name: 'Solving Systems with Matrices', standard: 'A.REI.C.8', url: 'https://www.jmap.org/htmlstandard/A.REI.C.8.htm' },
      { name: 'Cramer Rule', standard: 'A.REI.C.9', url: 'https://www.jmap.org/htmlstandard/A.REI.C.9.htm' },
      { name: 'Matrix Transformations', standard: 'N.VM.C.11', url: 'https://www.jmap.org/htmlstandard/N.VM.C.11.htm' },
      { name: 'Identity Matrix', standard: 'N.VM.C.10', url: 'https://www.jmap.org/htmlstandard/N.VM.C.10.htm' },
    ],
  },
];

export default function QuestionNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const promptFileRef = useRef<HTMLInputElement>(null);
  const answerFileRef = useRef<HTMLInputElement>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(true);

  // Form state
  const [jmapResourceType, setJmapResourceType] = useState<string>('');
  const [jmapSearch, setJmapSearch] = useState('');
  const [jmapUrl, setJmapUrl] = useState('');
  const [jmapId, setJmapId] = useState('');
  const [promptText, setPromptText] = useState('');
  const [promptImage, setPromptImage] = useState<File | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerImage, setAnswerImage] = useState<File | null>(null);
  const [isExtractingAnswer, setIsExtractingAnswer] = useState(false);
  const [difficulty, setDifficulty] = useState('2');
  const [band, setBand] = useState<'foundation' | 'core' | 'extension' | 'depth'>('core');
  const [answerGroup, setAnswerGroup] = useState('');
  const [rubricSteps, setRubricSteps] = useState<RubricStep[]>([
    { description: '', points: 1 },
  ]);

  // Assessment mode: 'teacher' = teacher-uploaded answer key, 'ai' = AI assesses without answer key
  const [assessmentMode, setAssessmentMode] = useState<'teacher' | 'ai'>('teacher');

  // Grading scale state
  const [gradingScaleType, setGradingScaleType] = useState<'danielson' | 'custom' | ''>('');
  const [customGrades, setCustomGrades] = useState<GradeLevel[]>([
    { letter: 'A', label: 'Excellent', minPercent: 90, maxPercent: 100 },
    { letter: 'B', label: 'Proficient', minPercent: 80, maxPercent: 89 },
    { letter: 'C', label: 'Developing', minPercent: 65, maxPercent: 79 },
    { letter: 'D', label: 'Needs Improvement', minPercent: 55, maxPercent: 64 },
  ]);

  useEffect(() => {
    fetchTopics();
  }, []);

  async function fetchTopics() {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setTopics(data || []);
    } catch (error) {
      console.error('Error fetching topics:', error);
    } finally {
      setLoadingTopics(false);
    }
  }

  const handleTopicToggle = (topicId: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
  };

  const addRubricStep = () => {
    setRubricSteps([...rubricSteps, { description: '', points: 1 }]);
  };

  const updateRubricStep = (index: number, field: keyof RubricStep, value: string | number) => {
    const updated = [...rubricSteps];
    updated[index] = { ...updated[index], [field]: value };
    setRubricSteps(updated);
  };

  const removeRubricStep = (index: number) => {
    if (rubricSteps.length > 1) {
      setRubricSteps(rubricSteps.filter((_, i) => i !== index));
    }
  };

  const updateCustomGrade = (index: number, field: keyof GradeLevel, value: string | number) => {
    const updated = [...customGrades];
    updated[index] = { ...updated[index], [field]: value };
    setCustomGrades(updated);
  };

  const addCustomGrade = () => {
    const lastGrade = customGrades[customGrades.length - 1];
    const newMin = Math.max(0, lastGrade.minPercent - 15);
    const newMax = lastGrade.minPercent - 1;
    setCustomGrades([
      ...customGrades,
      { letter: 'F', label: 'Failing', minPercent: newMin, maxPercent: newMax },
    ]);
  };

  const removeCustomGrade = (index: number) => {
    if (customGrades.length > 1) {
      setCustomGrades(customGrades.filter((_, i) => i !== index));
    }
  };

  const getActiveGrades = (): GradeLevel[] => {
    if (gradingScaleType === 'danielson') return DANIELSON_SCALE;
    if (gradingScaleType === 'custom') return customGrades;
    return [];
  };

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('question-assets')
      .upload(path, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('question-assets')
      .getPublicUrl(path);

    return urlData.publicUrl;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAnswerImageUpload = async (file: File) => {
    setAnswerImage(file);
    setIsExtractingAnswer(true);

    try {
      const imageBase64 = await fileToBase64(file);
      
      const { data, error } = await supabase.functions.invoke('extract-answer-key', {
        body: { imageBase64 },
      });

      if (error) {
        handleApiError(error, 'Answer extraction');
        return;
      }
      
      if (checkResponseForApiError(data)) {
        return;
      }
      
      if (!data?.success) throw new Error(data?.error || 'Failed to extract answer');

      setAnswerText(data.answerText);
      toast({
        title: 'Answer extracted',
        description: 'AI has extracted the answer from the uploaded image.',
      });
    } catch (err) {
      console.error('Error extracting answer:', err);
      handleApiError(err, 'Answer extraction');
    } finally {
      setIsExtractingAnswer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      // Upload images if provided
      let promptImageUrl = null;
      let answerImageUrl = null;

      if (promptImage) {
        promptImageUrl = await uploadImage(promptImage, 'prompts');
      }
      if (answerImage) {
        answerImageUrl = await uploadImage(answerImage, 'answers');
      }

      // Create question
      const { data: questionData, error: questionError } = await supabase
        .from('questions')
        .insert({
          teacher_id: user.id,
          jmap_url: jmapUrl || null,
          jmap_id: jmapId || null,
          prompt_text: promptText || null,
          prompt_image_url: promptImageUrl,
          answer_text: assessmentMode === 'teacher' ? (answerText || null) : null,
          answer_image_url: assessmentMode === 'teacher' ? answerImageUrl : null,
          difficulty: parseInt(difficulty),
          band,
          answer_group: answerGroup.trim() || null,
          assessment_mode: assessmentMode,
        })
        })
        .select()
        .single();

      if (questionError) throw questionError;

      // Add topic associations
      if (selectedTopics.length > 0) {
        const topicLinks = selectedTopics.map((topicId) => ({
          question_id: questionData.id,
          topic_id: topicId,
        }));

        const { error: topicError } = await supabase
          .from('question_topics')
          .insert(topicLinks);

        if (topicError) throw topicError;
      }

      // Add rubric steps
      const validSteps = rubricSteps.filter((s) => s.description.trim());
      if (validSteps.length > 0) {
        const rubricData = validSteps.map((step, index) => ({
          question_id: questionData.id,
          step_number: index + 1,
          description: step.description,
          points: step.points,
        }));

        const { error: rubricError } = await supabase
          .from('rubrics')
          .insert(rubricData);

        if (rubricError) throw rubricError;
      }

      toast({
        title: 'Question added!',
        description: 'The question has been added to your bank.',
      });

      navigate('/questions');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create question',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/questions')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Questions
        </Button>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* JMAP Reference */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Add JMAP Question</CardTitle>
                  <CardDescription>
                    Reference a JMAP question and upload your assets
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jmapResource">JMAP Resource</Label>
                <Select value={jmapResourceType} onValueChange={setJmapResourceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a JMAP resource..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="algebra1">Algebra I</SelectItem>
                    <SelectItem value="algebra2">Algebra II</SelectItem>
                    <SelectItem value="geometry">Geometry</SelectItem>
                    <SelectItem value="precalculus">Precalculus</SelectItem>
                  </SelectContent>
                </Select>
                {jmapResourceType === 'algebra1' && (
                  <a
                    href="https://www.jmap.org/JMAP_RESOURCES_BY_TOPIC.htm#AI"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View all Algebra I resources on JMAP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {jmapResourceType === 'algebra2' && (
                  <a
                    href="https://www.jmap.org/JMAP_RESOURCES_BY_TOPIC.htm#AII"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View all Algebra II resources on JMAP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {jmapResourceType === 'geometry' && (
                  <a
                    href="https://www.jmap.org/JMAP_RESOURCES_BY_TOPIC.htm#GEO"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View all Geometry resources on JMAP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {jmapResourceType === 'precalculus' && (
                  <a
                    href="https://www.jmap.org/JMAP_RESOURCES_BY_TOPIC.htm#PC"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View all Precalculus resources on JMAP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {(jmapResourceType === 'geometry' || jmapResourceType === 'algebra1' || jmapResourceType === 'algebra2' || jmapResourceType === 'precalculus') && (
                <div className="space-y-4">
                  <Label>Select Topic/Standard</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by topic name or standard code (e.g., G.GPE.B.4)..."
                      value={jmapSearch}
                      onChange={(e) => setJmapSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {(() => {
                    const allTopics = jmapResourceType === 'geometry' ? GEOMETRY_JMAP_TOPICS : 
                      jmapResourceType === 'algebra1' ? ALGEBRA1_JMAP_TOPICS : 
                      jmapResourceType === 'algebra2' ? ALGEBRA2_JMAP_TOPICS : PRECALCULUS_JMAP_TOPICS;
                    
                    const searchLower = jmapSearch.toLowerCase().trim();
                    
                    const filteredCategories = allTopics.map(category => ({
                      ...category,
                      topics: category.topics.filter(topic => 
                        !searchLower || 
                        topic.name.toLowerCase().includes(searchLower) ||
                        topic.standard.toLowerCase().includes(searchLower)
                      )
                    })).filter(category => category.topics.length > 0);

                    if (filteredCategories.length === 0) {
                      return (
                        <div className="text-center py-6 text-muted-foreground">
                          No topics found matching "{jmapSearch}"
                        </div>
                      );
                    }

                    return filteredCategories.map((category) => (
                      <div key={category.category} className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">{category.category}</h4>
                        <div className="grid gap-2">
                          {category.topics.map((topic, index) => (
                            <div
                              key={`${topic.standard}-${index}`}
                              className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  id={`${topic.standard}-${index}`}
                                  checked={jmapId === topic.standard && jmapUrl === topic.url}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setJmapId(topic.standard);
                                      setJmapUrl(topic.url);
                                    } else {
                                      setJmapId('');
                                      setJmapUrl('');
                                    }
                                  }}
                                />
                                <label htmlFor={`${topic.standard}-${index}`} className="text-sm cursor-pointer">
                                  {topic.name}
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(topic.standard);
                                    const btn = document.getElementById(`copy-btn-${topic.standard}-${index}`);
                                    if (btn) {
                                      btn.setAttribute('data-copied', 'true');
                                      setTimeout(() => btn.removeAttribute('data-copied'), 2000);
                                    }
                                  }}
                                  id={`copy-btn-${topic.standard}-${index}`}
                                >
                                  <Copy className="h-3 w-3 mr-1 [button[data-copied=true]_&]:hidden" />
                                  <Check className="h-3 w-3 mr-1 hidden [button[data-copied=true]_&]:block text-green-500" />
                                  Copy
                                </Button>
                                <a
                                  href={topic.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  {topic.standard}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jmapUrl">JMAP URL</Label>
                  <Input
                    id="jmapUrl"
                    placeholder="https://www.jmap.org/..."
                    value={jmapUrl}
                    onChange={(e) => setJmapUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jmapId">JMAP Question ID</Label>
                  <Input
                    id="jmapId"
                    placeholder="e.g., G.CO.A.1"
                    value={jmapId}
                    onChange={(e) => setJmapId(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Content */}
          <Card>
            <CardHeader>
              <CardTitle>Question Content</CardTitle>
              <CardDescription>
                Upload the question prompt (image/PDF) you have permission to use
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="promptText">Question Description / Text</Label>
                <Textarea
                  id="promptText"
                  placeholder="Brief description of the question..."
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Prompt Image</Label>
                <input
                  ref={promptFileRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setPromptImage(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {promptImage ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <span className="text-sm flex-1 truncate">{promptImage.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPromptImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => promptFileRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Question Image
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Easy</SelectItem>
                    <SelectItem value="2">Medium</SelectItem>
                    <SelectItem value="3">Hard</SelectItem>
                    <SelectItem value="4">Challenge</SelectItem>
                    <SelectItem value="5">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Assessment Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Grading Method
              </CardTitle>
              <CardDescription>
                Choose how student work will be assessed for this question
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={assessmentMode}
                onValueChange={(value: 'teacher' | 'ai') => setAssessmentMode(value)}
                className="grid gap-4"
              >
                <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="teacher" id="teacher-mode" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="teacher-mode" className="flex items-center gap-2 font-medium cursor-pointer">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Teacher-Uploaded Solution
                    </label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload an image of correct student work. AI will compare student submissions against this answer key.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="ai" id="ai-mode" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="ai-mode" className="flex items-center gap-2 font-medium cursor-pointer">
                      <Bot className="h-4 w-4 text-primary" />
                      AI-Assessed Solution
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Recommended</span>
                    </label>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI will independently solve the problem and assess if student work is mathematically correct. No answer key needed.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Answer Key - Only show for teacher mode */}
          {assessmentMode === 'teacher' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Answer Key
                  <Sparkles className="h-4 w-4 text-primary" />
                </CardTitle>
                <CardDescription>
                  Upload an image of correct student work and AI will extract the answer automatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Upload Correct Student Work</Label>
                  <input
                    ref={answerFileRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAnswerImageUpload(file);
                    }}
                    className="hidden"
                  />
                  {answerImage ? (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      {isExtractingAnswer ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm flex-1">Extracting answer with AI...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{answerImage.name}</span>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setAnswerImage(null);
                          setAnswerText('');
                        }}
                        disabled={isExtractingAnswer}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => answerFileRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Student Work Image
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload an image showing correct work. AI will extract the solution steps and final answer.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="answerText">Extracted Answer (editable)</Label>
                  <Textarea
                    id="answerText"
                    placeholder="Answer will be extracted from the uploaded image, or enter manually..."
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    rows={6}
                    disabled={isExtractingAnswer}
                    className={isExtractingAnswer ? 'opacity-50' : ''}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Topics */}
          <Card>
            <CardHeader>
              <CardTitle>Topics & Standards</CardTitle>
              <CardDescription>Select all topics that apply</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTopics ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 bg-muted rounded" />
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {topics.map((topic) => (
                    <div key={topic.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={topic.id}
                        checked={selectedTopics.includes(topic.id)}
                        onCheckedChange={() => handleTopicToggle(topic.id)}
                      />
                      <label
                        htmlFor={topic.id}
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {topic.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grading Scale */}
          <Card>
            <CardHeader>
              <CardTitle>Grading Scale</CardTitle>
              <CardDescription>Choose a letter grade scale for this question (optional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Scale Type</Label>
                <Select 
                  value={gradingScaleType} 
                  onValueChange={(value: 'danielson' | 'custom' | '') => setGradingScaleType(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No grading scale (use rubric points only)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="danielson">Danielson-Inspired (A-D)</SelectItem>
                    <SelectItem value="custom">Custom Scale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gradingScaleType === 'danielson' && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Danielson-Inspired Scale</Label>
                  <div className="grid gap-2">
                    {DANIELSON_SCALE.map((grade) => (
                      <div
                        key={grade.letter}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {grade.letter}
                        </span>
                        <span className="flex-1 font-medium">{grade.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {grade.minPercent}% - {grade.maxPercent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {gradingScaleType === 'custom' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground">Custom Grade Levels</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addCustomGrade}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Grade
                    </Button>
                  </div>
                  {customGrades.map((grade, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        className="w-16 text-center font-bold"
                        placeholder="A"
                        maxLength={2}
                        value={grade.letter}
                        onChange={(e) => updateCustomGrade(index, 'letter', e.target.value.toUpperCase())}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Label (e.g., Excellent)"
                        value={grade.label}
                        onChange={(e) => updateCustomGrade(index, 'label', e.target.value)}
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="w-16"
                          min="0"
                          max="100"
                          placeholder="Min"
                          value={grade.minPercent}
                          onChange={(e) => updateCustomGrade(index, 'minPercent', parseInt(e.target.value) || 0)}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                          type="number"
                          className="w-16"
                          min="0"
                          max="100"
                          placeholder="Max"
                          value={grade.maxPercent}
                          onChange={(e) => updateCustomGrade(index, 'maxPercent', parseInt(e.target.value) || 100)}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      {customGrades.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCustomGrade(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rubric */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Rubric Checklist</CardTitle>
                  <CardDescription>Define scoring steps for this question</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addRubricStep}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {rubricSteps.map((step, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Step description..."
                      value={step.description}
                      onChange={(e) => updateRubricStep(index, 'description', e.target.value)}
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={step.points}
                      onChange={(e) => updateRubricStep(index, 'points', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  {rubricSteps.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRubricStep(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Total points: {rubricSteps.reduce((sum, s) => sum + s.points, 0)}
              </p>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/questions')}>
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Question'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
