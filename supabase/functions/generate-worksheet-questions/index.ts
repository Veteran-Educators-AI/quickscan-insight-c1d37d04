import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GeometryMetadata, GeometryValidationResult } from "../_shared/geometryTypes.ts";
import { validateGeometryMetadata } from "../_shared/geometryValidation.ts";
import { GEOMETRY_METADATA_INSTRUCTION } from "../_shared/geometryPromptExamples.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TopicInput {
  topicName: string;
  standard: string;
  subject: string;
  category: string;
}

// Bloom's Taxonomy Cognitive Levels (lowest to highest)
type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
type AdvancementLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type WorksheetMode = 'practice' | 'basic_assessment' | 'diagnostic' | 'warmup';

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  answer?: string; // The correct answer/solution for the teacher's answer key
  difficulty: 'medium' | 'hard' | 'challenging';
  bloomLevel: BloomLevel;
  bloomVerb: string; // The action verb used (e.g., "identify", "compare", "design")
  advancementLevel?: AdvancementLevel;
  svg?: string;
  imageUrl?: string;
  imagePrompt?: string;
  geometry?: GeometryMetadata; // NEW: Structured geometry metadata
  geometryValidation?: GeometryValidationResult; // NEW: Validation result
  hint?: string;
}

interface AnswerKeyItem {
  questionNumber: number;
  final_answer: string;
  accepted_answers: string[];
  solution_outline: string[];
  common_errors: string[];
  grading_rubric: string[];
  confidence: number;
}

async function callLovableAI(prompt: string, modelOrAdvanced: boolean | string = false): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Determine model: if string, use it; if boolean, select default advanced/basic
  let model: string;
  if (typeof modelOrAdvanced === 'string') {
    model = modelOrAdvanced;
  } else {
    // Use openai/gpt-5.2 for complex geometry/physics, google/gemini-2.5-flash for standard worksheets
    model = modelOrAdvanced ? 'openai/gpt-5.2' : 'google/gemini-2.5-flash';
  }
  
  console.log(`Using AI model: ${model}`);

  // OpenAI models (gpt-5, etc.) require max_completion_tokens, Gemini uses max_tokens
  const isOpenAIModel = model.startsWith('openai/');
  const tokenParams = isOpenAIModel 
    ? { max_completion_tokens: 12000 }
    : { max_tokens: 12000 };

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are an expert math educator creating textbook-quality problems. 

CRITICAL FORMATTING REQUIREMENTS - MUST FOLLOW EXACTLY:

NEVER use LaTeX notation. Do NOT use:
- Dollar signs for math: $x$ or $$equation$$
- Backslash commands: \\frac, \\neq, \\geq, \\leq, \\sqrt, \\cdot, \\times, etc.
- Any LaTeX syntax whatsoever

INSTEAD, use proper mathematical Unicode symbols DIRECTLY in ALL questions:
  • Use π (not "pi", not "\\pi", not "$\\pi$")
  • Use √ for square roots (e.g., √2, √3, √(x+1))
  • Use ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ for exponents (e.g., x², y³, r⁴)
  • Use ° for degrees (e.g., 45°, 90°)
  • Use ∠ for angles (e.g., ∠ABC)
  • Use ≤ ≥ ≠ for inequalities (NOT \\leq \\geq \\neq)
  • Use × for multiplication in expressions
  • Use ÷ for division where appropriate
  • Use θ for angle theta
  • Use ½ ⅓ ¼ ⅔ ¾ for common fractions
  • For complex fractions, write as: (numerator)/(denominator) e.g., (x² + 1)/(x - 2)
  • Use ⊥ for perpendicular
  • Use ∥ for parallel
  • Use △ for triangle notation (e.g., △ABC)
  • Use ≅ for congruent
  • Use ~ for similar

CURRENCY FORMATTING (CRITICAL):
  • ALL money values MUST include the dollar sign: $4.00, $12.50, $100.00
  • Always use two decimal places for cents: $5.00 (not $5)
  • For word problems involving money, profit, cost, price, revenue, savings, etc. - ALWAYS format as currency
  • Examples: "The item costs $4.00" NOT "The item costs 4.00"
  • Examples: "He earned a profit of $25.50" NOT "He earned a profit of 25.50"
  • This helps students understand real-world financial context

SVG CRITICAL RULES (if generating SVG):
  • Keep SVG paths EXTREMELY simple - use basic shapes only
  • Maximum 500 characters per SVG string
  • Prefer simple geometric primitives (rect, circle, line, polygon) over complex paths
  • If a diagram is complex, use imagePrompt instead of svg
  
Write questions in a fluid, professional textbook style - complete sentences, clear mathematical language, and elegant formatting.

Return a JSON OBJECT with a single key "questions" containing the array of generated questions. Do not return a raw array.` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        ...tokenParams,
        ...(isOpenAIModel ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('AI credits exhausted. Please add funds to continue.');
      }
      // For other errors, include the status code in the message
      throw new Error(`AI API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const responseText = await response.text();
    
    if (!responseText || responseText.trim() === '') {
      console.error('Empty response from Lovable AI');
      throw new Error('AI returned empty response. Please try again.');
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText.substring(0, 500));
      throw new Error('Invalid response format from AI. Please try again.');
    }
    
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in AI response data:', JSON.stringify(data).substring(0, 500));
      throw new Error('No content in AI response');
    }
    
    return content;
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    // Re-throw errors that are already formatted
    if (error.message && (error.message.includes("Rate limit") || error.message.includes("credits") || error.message.includes("AI API error"))) {
      throw error;
    }
    throw new Error(`Failed to communicate with AI service: ${error.message || "Unknown error"}`);
  }
}

const ANSWER_KEY_MODEL = 'google/gemini-2.5-flash';

const stripMarkdownCodeFences = (input: string) => input
  .trim()
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/, '')
  .replace(/\s*```\s*$/, '')
  .trim();

const clampConfidence = (value: unknown, fallback = 0.55) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
};

const extractFinalAnswer = (answer?: string) => {
  if (!answer) return '';

  const explicitMatch = answer.match(/\*\*Final Answer:\*\*\s*(.+)$/im)
    ?? answer.match(/Final Answer:\s*(.+)$/im);

  if (explicitMatch?.[1]) {
    return explicitMatch[1].trim();
  }

  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? '';
};

const buildSolutionOutline = (answer?: string) => {
  if (!answer) return [];

  return answer
    .split(/\n+/)
    .map((line) => line
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^Step\s*\d+:\s*/i, '')
      .replace(/^\d+[).\s-]*/, '')
      .trim()
    )
    .filter(Boolean)
    .filter((line) => !/^final answer:/i.test(line))
    .slice(0, 6);
};

const buildFallbackAnswerKey = (questions: GeneratedQuestion[]): AnswerKeyItem[] =>
  questions.map((question) => {
    const finalAnswer = extractFinalAnswer(question.answer);
    const solutionOutline = buildSolutionOutline(question.answer);

    return {
      questionNumber: question.questionNumber,
      final_answer: finalAnswer || question.answer || '',
      accepted_answers: [finalAnswer || question.answer || ''].filter(Boolean),
      solution_outline: solutionOutline.length > 0
        ? solutionOutline
        : ['Review the teacher solution for the full worked steps.'],
      common_errors: [
        'Incorrect arithmetic or algebraic simplification',
        'Using the wrong formula or operation',
      ],
      grading_rubric: [
        'Matches the final answer or an equivalent form',
        'Shows a valid method aligned to the teacher solution',
      ],
      confidence: finalAnswer ? 0.58 : 0.4,
    };
  });

async function callLovableAIWithCustomSystem(systemPrompt: string, userPrompt: string, model: string = ANSWER_KEY_MODEL): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText.substring(0, 100)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in AI response');
  }

  return content;
}

async function generateStructuredAnswerKey(questions: GeneratedQuestion[]): Promise<AnswerKeyItem[]> {
  const fallbackAnswerKey = buildFallbackAnswerKey(questions);
  const fallbackByQuestionNumber = new Map(fallbackAnswerKey.map((item) => [item.questionNumber, item]));

  if (questions.length === 0) {
    return fallbackAnswerKey;
  }

  const systemPrompt = `You convert teacher solutions into structured grading keys for worksheet autograding.
Return ONLY valid JSON with this exact shape:
{
  "answer_key": [
    {
      "questionNumber": 1,
      "final_answer": "...",
      "accepted_answers": ["..."],
      "solution_outline": ["step 1", "step 2"],
      "common_errors": ["error 1", "error 2"],
      "grading_rubric": ["criterion 1", "criterion 2"],
      "confidence": 0.84
    }
  ]
}
Rules:
- accepted_answers must include the canonical final_answer and equivalent concise variants when appropriate.
- solution_outline must be short grading-focused steps, not full prose.
- common_errors must be concrete likely student mistakes.
- grading_rubric must be concise teacher-facing criteria.
- confidence must be a number from 0 to 1.
- Never include markdown, commentary, or omitted fields.`;

  const userPrompt = JSON.stringify({
    questions: questions.map((question) => ({
      questionNumber: question.questionNumber,
      question: question.question,
      teacher_solution: question.answer || '',
    })),
  });

  try {
    const content = await callLovableAIWithCustomSystem(systemPrompt, userPrompt);
    const cleanContent = stripMarkdownCodeFences(content);
    const jsonCandidate = cleanContent.match(/\{[\s\S]*\}/)?.[0] ?? cleanContent;
    const parsed = JSON.parse(jsonCandidate);
    const rawAnswerKey = Array.isArray(parsed)
      ? parsed
      : parsed?.answer_key ?? parsed?.answerKey ?? [];

    if (!Array.isArray(rawAnswerKey) || rawAnswerKey.length === 0) {
      throw new Error('Structured answer key payload missing answer_key array');
    }

    return questions.map((question) => {
      const fallbackItem = fallbackByQuestionNumber.get(question.questionNumber)!;
      const matchedItem = rawAnswerKey.find((item) => Number(item?.questionNumber) === question.questionNumber) ?? {};

      const acceptedAnswers = Array.isArray(matchedItem.accepted_answers)
        ? matchedItem.accepted_answers.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const solutionOutline = Array.isArray(matchedItem.solution_outline)
        ? matchedItem.solution_outline.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const commonErrors = Array.isArray(matchedItem.common_errors)
        ? matchedItem.common_errors.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const gradingRubric = Array.isArray(matchedItem.grading_rubric)
        ? matchedItem.grading_rubric.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];

      const finalAnswer = typeof matchedItem.final_answer === 'string' && matchedItem.final_answer.trim()
        ? matchedItem.final_answer.trim()
        : fallbackItem.final_answer;

      return {
        questionNumber: question.questionNumber,
        final_answer: finalAnswer,
        accepted_answers: Array.from(new Set([...acceptedAnswers, finalAnswer].filter(Boolean))).slice(0, 8),
        solution_outline: solutionOutline.length > 0 ? solutionOutline : fallbackItem.solution_outline,
        common_errors: commonErrors.length > 0 ? commonErrors : fallbackItem.common_errors,
        grading_rubric: gradingRubric.length > 0 ? gradingRubric : fallbackItem.grading_rubric,
        confidence: clampConfidence(matchedItem.confidence, fallbackItem.confidence),
      };
    });
  } catch (error) {
    console.warn('Structured answer key generation failed, using fallback answer key.', error);
    return fallbackAnswerKey;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      topics, 
      questionCount, 
      difficultyLevels, 
      bloomLevels, 
      includeGeometry, 
      includeFormulas, 
      includeGraphPaper, 
      includeCoordinateGeometry, 
      useAIImages, 
      worksheetMode, 
      variationSeed, 
      studentName, 
      formVariation, 
      formSeed, 
      includeHints, 
      includeAnswerKey,
      studentContext,
      targetMisconceptions,
      englishContext,
    } = await req.json() as {
      topics: TopicInput[];
      questionCount: number;
      difficultyLevels?: string[];
      bloomLevels?: BloomLevel[];
      includeGeometry?: boolean;
      includeFormulas?: boolean;
      includeGraphPaper?: boolean;
      includeCoordinateGeometry?: boolean;
      useAIImages?: boolean;
      worksheetMode?: WorksheetMode;
      variationSeed?: number;
      studentName?: string;
      formVariation?: string;
      formSeed?: number;
      includeHints?: boolean;
      includeAnswerKey?: boolean;
      studentContext?: {
        studentLevel?: string;
        trend?: 'improving' | 'stable' | 'declining';
        weakTopics?: string[];
        misconceptions?: string[];
        averageScore?: number;
      };
      targetMisconceptions?: string[];
      englishContext?: {
        textTitle: string;
        author: string;
        genre: string;
        themes: string[];
        literaryDevices: string[];
        gradeLevel: string;
        questionFormat: 'multiple_choice' | 'short_answer' | 'extended_response' | 'text_evidence' | 'mixed';
        focusAreas: string[];
        includeTextReferences: boolean;
        includeRubric: boolean;
        lessonObjectives?: string[];
      };
    };

    if (!topics || topics.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No topics provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the prompt
    const topicsList = topics.map((t, i) => 
      `${i + 1}. Topic: "${t.topicName}" (Standard: ${t.standard}, Subject: ${t.subject}, Category: ${t.category})`
    ).join('\n');

    const questionsPerTopic = Math.ceil(questionCount / topics.length);
    
    // Handle warm-up mode with very easy questions
    const isWarmup = worksheetMode === 'warmup';
    const warmupDifficulty = difficultyLevels?.[0] || 'very-easy';
    const allowedDifficulties = isWarmup 
      ? [warmupDifficulty]
      : (difficultyLevels && difficultyLevels.length > 0 
        ? difficultyLevels 
        : ['medium', 'hard', 'challenging']);
    
    let difficultyInstruction: string;
    if (isWarmup) {
      if (warmupDifficulty === 'super-easy') {
        difficultyInstruction = 'Generate ONLY super easy questions. These should be basic math facts that students can answer in seconds. Examples: "What is 2 + 2?", "What is 3 × 4?", "What is half of 10?". Single-step basic arithmetic ONLY. No word problems, no multi-step calculations.';
      } else if (warmupDifficulty === 'very-easy') {
        difficultyInstruction = 'Generate ONLY very easy, confidence-building questions. These should be extremely simple recall or basic one-step arithmetic that ANY student can solve immediately. Examples: "What is 3 + 5?", "What is the area of a square with side 2?". NO multi-step problems. Keep it VERY simple.';
      } else {
        difficultyInstruction = 'Generate easy confidence-building questions. These should be simple one-step application problems. Examples: "If a rectangle has length 4 and width 3, what is its area?", "Solve: 2x = 10". Keep problems straightforward with minimal steps.';
      }
    } else {
      // Map super-easy and easy to specific instructions for main questions
      const hasEasyLevels = allowedDifficulties.some(d => d === 'easy' || d === 'super-easy');
      if (hasEasyLevels) {
        difficultyInstruction = `Generate questions with these difficulty levels: ${allowedDifficulties.join(', ')}.
- "super-easy": Basic math facts, single arithmetic operations (e.g., "What is 7 × 8?", "Simplify: 15 ÷ 3")
- "easy": Simple one-step problems with straightforward application (e.g., "Find the area of a rectangle with length 5 and width 3")
- "medium": Standard problems requiring 2-3 steps
- "hard": Complex problems requiring analysis and multiple steps
- "challenging": Advanced problems requiring synthesis and creative problem-solving`;
      } else {
        difficultyInstruction = `Only generate questions with these difficulty levels: ${allowedDifficulties.join(', ')}.`;
      }
    }

    // Form-based variation for anti-copying (different from per-student variation)
    const formInstruction = formVariation && formSeed
      ? `
FORM VARIATION (CRITICAL - ANTI-COPYING MEASURE FOR DIAGNOSTICS):
- This is Form ${formVariation} of the diagnostic assessment
- Use form seed: ${formSeed} to ensure this form has COMPLETELY DIFFERENT questions from other forms
- Forms A, B, C, D, E should each have UNIQUE question sets testing the SAME concepts
- Vary: specific numbers, contexts, problem scenarios, names in word problems
- Keep: same difficulty level, same concepts being tested, same skills assessed
- Example: Form A might ask "Find the area of a rectangle 5×3", Form B asks "Find the area of a rectangle 7×4"
- This prevents students sitting together from copying each other's answers
- Each form tests the same material but with different specific problems`
      : '';

    // Legacy variation instruction for unique questions per student (kept for backward compatibility)
    const variationInstruction = variationSeed 
      ? `
VARIATION REQUIREMENT (CRITICAL - ANTI-COPYING MEASURE):
- Use variation seed: ${variationSeed}
- Generate UNIQUE questions that differ from other students' worksheets
- Vary: numbers, contexts, names in word problems, specific values, order of operations
- Keep the same concepts and difficulty, but change the specific details
- Example: Instead of "Find the area of a rectangle with length 5 and width 3", use different numbers like "6 and 4" or different contexts like "Find the perimeter of a garden..."
- This ensures each student ${studentName ? `(${studentName})` : ''} gets a unique worksheet`
      : '';

    // Bloom's Taxonomy filter
    const allowedBloomLevels = bloomLevels && bloomLevels.length > 0 
      ? bloomLevels 
      : ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const bloomInstruction = `ONLY generate questions for these Bloom's Taxonomy cognitive levels: ${allowedBloomLevels.join(', ')}. Do NOT include questions from other cognitive levels.`;

    // Detect if this is a geometry-heavy topic that should automatically get diagrams
    const geometryTopicKeywords = [
      'geometry', 'triangle', 'circle', 'radius', 'diameter', 'chord', 'secant', 'tangent',
      'arc', 'sector', 'angle', 'polygon', 'quadrilateral', 'similar', 'congruent',
      'coordinate', 'trigonometry', 'trig', 'sine', 'cosine', 'tangent', 'parabola',
      'ellipse', 'hyperbola', 'dilation', 'reflection', 'translation', 'rotation',
    ];

    const isGeometrySubject = topics.some((t) => {
      const subject = t.subject?.toLowerCase() || '';
      const category = t.category?.toLowerCase() || '';
      const topicName = t.topicName?.toLowerCase() || '';
      const standard = t.standard?.toLowerCase() || '';
      const searchableText = `${subject} ${category} ${topicName} ${standard}`;

      return geometryTopicKeywords.some((keyword) => searchableText.includes(keyword));
    });
    
    // Financial Math and other non-geometry subjects should NEVER get diagrams
    const noImageSubjects = ['financial', 'finance', 'economics', 'history', 'government', 'english', 'ela'];
    const isNoImageSubject = topics.some(t => 
      noImageSubjects.some(ns => 
        t.subject?.toLowerCase().includes(ns) || 
        t.category?.toLowerCase().includes(ns) ||
        t.topicName?.toLowerCase().includes(ns)
      )
    );

    const shouldGenerateDiagrams = includeGeometry && isGeometrySubject && !isNoImageSubject;

    // Build optional instructions for geometry and formulas
    // IMPORTANT: Geometry worksheets should still return diagram metadata even when AI raster image generation is off.
    let geometryInstruction = '';
    if (shouldGenerateDiagrams) {
      geometryInstruction = `
8. For geometry-related questions, you MUST include an "imagePrompt" field. Write the prompt using this STRICT format:

═══════════════════════════════════════════════════════════════════════════════
IMAGEPROMPT FORMAT - USE THIS EXACT STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

Your imagePrompt must be a SIMPLE, CLEAR description that includes:

1. WHAT TO DRAW: State the shape/diagram type simply
2. COORDINATES/VERTICES: List each point with its EXACT coordinates
3. CONNECTIONS: State which points connect to form the shape
4. LABELS: Specify how to label each vertex (Letter + coordinates)
5. MEASUREMENTS: Only include if specifically needed

═══════════════════════════════════════════════════════════════════════════════
STRICT RULES FOR imagePrompt
═══════════════════════════════════════════════════════════════════════════════

- Keep it SIMPLE and SPECIFIC
- List vertices in order: A, B, C, D (clockwise from bottom-left usually)
- Each vertex gets ONE label only - never repeat labels
- Place labels OUTSIDE the shape
- Black lines on white background only
- No colors, no shading, no gradients
- No extra decorations or arrows unless needed

═══════════════════════════════════════════════════════════════════════════════
EXAMPLE: Rectangle on Coordinate Plane
═══════════════════════════════════════════════════════════════════════════════

"Draw a coordinate plane with x-axis from 0 to 8 and y-axis from 0 to 5.

Plot these 4 points as black dots:
- A at (1, 1) - label it 'A(1,1)' to the lower-left
- B at (7, 1) - label it 'B(7,1)' to the lower-right  
- C at (7, 4) - label it 'C(7,4)' to the upper-right
- D at (1, 4) - label it 'D(1,4)' to the upper-left

Connect A→B→C→D→A with straight black lines to form a rectangle.

Label the bottom side '6 units' and the right side '3 units'.

Black and white only. Simple and clean."

═══════════════════════════════════════════════════════════════════════════════
EXAMPLE: Right Triangle
═══════════════════════════════════════════════════════════════════════════════

"Draw a right triangle with:
- Vertex A at the top
- Vertex B at the bottom-left (right angle here)
- Vertex C at the bottom-right

The base BC is horizontal. The side AB is vertical. The hypotenuse AC is diagonal.

Mark the right angle at B with a small square symbol.

Label the sides:
- AB (vertical) = '6 cm'
- BC (horizontal) = '8 cm'  
- AC (diagonal) = '10 cm'

Place vertex labels A, B, C outside the triangle near each corner.

Black and white only. Simple and clean."

═══════════════════════════════════════════════════════════════════════════════
DO NOT DO THESE THINGS IN YOUR imagePrompt
═══════════════════════════════════════════════════════════════════════════════
- DO NOT repeat vertex labels (each letter appears once)
- DO NOT add colors or shading
- DO NOT add unnecessary arrows or decorations
- DO NOT make it overly complex
- DO NOT forget to specify label positions`;
    }

    let formulasInstruction = '';
    if (includeFormulas) {
      formulasInstruction = `
${includeGeometry ? '9' : '8'}. Include mathematical formulas and expressions in your questions:
   - Use standard mathematical notation (e.g., "x² + 2x + 1 = 0", "sin(θ) = opposite/hypotenuse")
   - Reference formulas like quadratic formula, Pythagorean theorem, area/volume formulas
   - Include problems that require students to apply or derive formulas
   - Use proper mathematical symbols where appropriate (√, π, ², ³, etc.)`;
    }

    let graphPaperInstruction = '';
    if (includeGraphPaper) {
      const nextNum = (includeGeometry ? 9 : 8) + (includeFormulas ? 1 : 0);
      if (shouldGenerateDiagrams) {
        graphPaperInstruction = `
${nextNum}. Include questions that require graph paper solutions:
   - Problems involving plotting points, lines, and curves on a coordinate plane
   - Graphing linear equations, quadratics, or other functions
   - Questions that ask students to "graph and show your work"
   
   For these questions, include an "imagePrompt" field with EXPLICIT details like:
   "A Cartesian coordinate plane with a complete grid pattern:
    - X-axis labeled from -10 to 10 with tick marks at each integer.
    - Y-axis labeled from -10 to 10 with tick marks at each integer.
    - Grid lines are thin and gray, axes are bold black with arrows.
    - The linear equation y = 2x + 1 is graphed as a straight line.
    - Two points on the line are marked: (0, 1) labeled 'y-intercept' and (2, 5) labeled with coordinates.
    - The slope is illustrated with a right triangle showing 'rise = 4' and 'run = 2'."`;
      } else {
        graphPaperInstruction = `
${nextNum}. Include questions that require graph paper solutions:
   - Problems involving plotting points, lines, and curves on a coordinate plane
   - Graphing linear equations, quadratics, or other functions
   - Questions that ask students to "graph and show your work"
   - Describe the graph clearly in text so students can draw it themselves
   - DO NOT include any "svg" or "imagePrompt" fields - this worksheet is text-only`;
      }
    }

    let coordinateGeometryInstruction = '';
    if (includeCoordinateGeometry) {
      const nextNum = (includeGeometry ? 9 : 8) + (includeFormulas ? 1 : 0) + (includeGraphPaper ? 1 : 0);
      if (shouldGenerateDiagrams) {
        coordinateGeometryInstruction = `
${nextNum}. Include coordinate geometry problems with HIGHLY DETAILED imagePrompt fields:
   - Finding distance between points, midpoints, and slopes
   - Equations of lines (point-slope, slope-intercept forms)
   - Parallel and perpendicular lines in coordinate plane
   
   EXAMPLE imagePrompt for a distance/midpoint problem:
   "A Cartesian coordinate plane with a clear numbered grid from -5 to 10 on both axes.
    - Point P is plotted at exactly (2, 5) with a solid black dot, labeled 'P (2, 5)'.
    - Point Q is plotted at exactly (8, 3) with a solid black dot, labeled 'Q (8, 3)'.
    - A straight line segment PQ connects the two points.
    - The midpoint M at (5, 4) is marked with a smaller dot, labeled 'M (5, 4)'.
    - A dashed horizontal line from P shows the horizontal distance '6 units'.
    - A dashed vertical line from Q shows the vertical distance '2 units'.
    - The distance formula d = √[(x₂-x₁)² + (y₂-y₁)²] is written below."`;
      } else {
        coordinateGeometryInstruction = `
${nextNum}. Include coordinate geometry problems:
   - Finding distance between points, midpoints, and slopes
   - Equations of lines (point-slope, slope-intercept forms)
   - Parallel and perpendicular lines in coordinate plane
   - Proving geometric properties using coordinates
   - Describe all coordinates and shapes clearly in the question text
   - DO NOT include any "svg" or "imagePrompt" fields - this worksheet is text-only`;
      }
    }

    // Only include imageFieldNote when this worksheet should actually produce diagrams
    const imageFieldNote = shouldGenerateDiagrams
      ? `
If the question involves geometry and a diagram would help, include an "imagePrompt" field with a detailed description of the diagram. The imagePrompt field should ONLY be included when a visual diagram is genuinely helpful for the question.`
      : `
DO NOT include "svg" or "imagePrompt" fields. This is a TEXT-ONLY worksheet. Describe all shapes and diagrams verbally in the question text.`;

    // Hint instruction for students
    const hintInstruction = includeHints
      ? `
STUDENT HINTS (REQUIRED):
- Every question MUST include a "hint" field with a helpful hint for students
- Hints should give students a starting point WITHOUT giving away the answer
- Good hints include:
  • "Remember the formula for..." 
  • "Start by identifying what you're trying to find..."
  • "Think about how these two values relate..."
  • "Try drawing a picture to help you visualize..."
  • "What operation do you use when you see the word 'total'?"
- Keep hints encouraging and student-friendly
- Hints should be 1-2 sentences max
- The goal is to help students get "unstuck" without doing the problem for them`
      : '';

    // Answer key instruction - ALWAYS generate full worked solutions for grading accuracy
    const answerKeyInstruction = `
TEACHER ANSWER KEY (REQUIRED - ALWAYS INCLUDE):
- Every question MUST include an "answer" field with a COMPLETE, DETAILED worked solution
- This is CRITICAL for grading accuracy — the AI grader uses these solutions as reference
- Format each answer as a FULL step-by-step solution showing ALL work, not just the final answer
- Requirements:
  • Start with the approach/formula being used
  • Show every intermediate calculation step
  • Circle or bold the final answer
  • Include units where applicable
  • For word problems: identify variables, set up equation, solve, interpret
- Examples:
  • "answer": "Step 1: Use the formula A = πr²\nStep 2: Substitute r = 5\nStep 3: A = π(5)² = 25π\nStep 4: A = 25(3.14159) = 78.54\n\n**Final Answer: A ≈ 78.54 cm²**"
  • "answer": "Step 1: Set up the equation: 3x + 7 = 22\nStep 2: Subtract 7 from both sides: 3x = 15\nStep 3: Divide both sides by 3: x = 5\n\n**Final Answer: x = 5**"
  • "answer": "Step 1: Identify the triangle type — right triangle with legs 6 and 8\nStep 2: Apply Pythagorean theorem: c² = a² + b²\nStep 3: c² = 6² + 8² = 36 + 64 = 100\nStep 4: c = √100 = 10\n\n**Final Answer: The hypotenuse is 10 units**"
- Write solutions as if demonstrating the problem to a student — clear, complete, no shortcuts
- This answer key will be rendered in handwriting font and used as a grading reference`;

    // Diagnostic mode instructions for advancement levels
    const diagnosticInstruction = worksheetMode === 'diagnostic' 
      ? `
DIAGNOSTIC ASSESSMENT MODE:
- Each question MUST include an "advancementLevel" field with a value from A to F
- Level A = Advanced (most challenging, requires synthesis and complex reasoning)
- Level B = Proficient (challenging, requires analysis and application)
- Level C = Developing (moderate difficulty, requires application)
- Level D = Beginning (foundational application with some guidance)
- Level E = Emerging (basic understanding with scaffolding)
- Level F = Foundational (entry-level, basic recall and recognition)
- Distribute questions across ALL levels (A through F) to diagnose student abilities
- Questions should progressively increase in complexity from F to A
- This diagnostic data will be used to create differentiated follow-up worksheets${studentContext ? `

ADAPTIVE PERSONALIZATION (CRITICAL):
This worksheet is being generated for a specific student with the following performance profile:
- Current Level: ${studentContext.studentLevel || 'C'}
- Performance Trend: ${studentContext.trend || 'stable'}
- Average Score: ${studentContext.averageScore || 70}%
${studentContext.weakTopics?.length ? `- Weak Topics: ${studentContext.weakTopics.join(', ')}` : ''}
${studentContext.misconceptions?.length ? `- Known Misconceptions: ${studentContext.misconceptions.join('; ')}` : ''}

PERSONALIZATION REQUIREMENTS:
1. Focus questions on the student's weak areas to build mastery
2. Start with questions slightly below their current level to build confidence
3. Include questions that directly address their specific misconceptions
4. For students with declining trends, include more scaffolded questions with hints
5. For students with improving trends, include stretch questions to challenge growth
6. Make questions feel personalized - vary contexts, numbers, and scenarios uniquely` : ''}${targetMisconceptions?.length ? `

TARGET MISCONCEPTIONS (MUST ADDRESS):
The following specific misconceptions have been identified in this student's work. Create questions that DIRECTLY address and remediate these misunderstandings:
${targetMisconceptions.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

For each misconception, include at least one question designed to:
- Test whether the student still holds this misconception
- Guide them toward the correct understanding
- Provide opportunities to demonstrate corrected thinking` : ''}`
      : worksheetMode === 'warmup'
      ? `
WARM-UP MODE (Confidence Building):
- Generate ONLY very simple, easy questions that build student confidence
- These should be "quick wins" - problems any student can solve
- Focus on basic recall, simple one-step calculations, or recognition
- Use encouraging, approachable language
- Examples: "What is 5 + 7?", "If a rectangle has length 4 and width 2, what is its area?"
- Keep questions SHORT and straightforward
- NO complex multi-step problems
- NO challenging vocabulary
- This warm-up helps students feel confident before tackling harder problems`
      : '';

    const hintExample = includeHints ? ',\n    "hint": "Remember to use the formula for area. What shape is this?"' : '';
    const answerExample = ',\n    "answer": "Step 1: Use formula A = πr²\\nStep 2: A = π(5)² = 25π\\nStep 3: A ≈ 78.54\\n\\n**Final Answer: A ≈ 78.54 cm²**"';

    const exampleOutput = worksheetMode === 'diagnostic'
      ? `{
  "questions": [
    {
      "questionNumber": 1,
      "topic": "Topic Name",
      "standard": "G.CO.A.1",
      "question": "The full question text here",
      "difficulty": "${allowedDifficulties[0]}",
      "advancementLevel": "C"${hintExample}${answerExample}${useAIImages ? ',\n      "imagePrompt": "A detailed description of the geometric diagram needed"' : ''}
    }
  ]
}`
      : useAIImages
        ? `{
  "questions": [
    {
      "questionNumber": 1,
      "topic": "Topic Name",
      "standard": "G.CO.A.1",
      "question": "The full question text here",
      "difficulty": "${allowedDifficulties[0]}"${hintExample}${answerExample},
      "imagePrompt": "A detailed description of the geometric diagram needed"${includeGeometry && isGeometrySubject && !isNoImageSubject ? `,
      "geometry": {
        "type": "coordinate_polygon",
        "vertices": [{"label": "A", "x": 1, "y": 1}, {"label": "B", "x": 5, "y": 1}, {"label": "C", "x": 3, "y": 4}],
        "axes": {"minX": 0, "maxX": 6, "minY": 0, "maxY": 5, "showGrid": true, "showNumbers": true}
      }` : ''}
    }
  ]
}`
        : `{
  "questions": [
    {
      "questionNumber": 1,
      "topic": "Topic Name",
      "standard": "G.CO.A.1",
      "question": "The full question text here",
      "difficulty": "${allowedDifficulties[0]}"${hintExample}${answerExample}${includeGeometry && isGeometrySubject && !isNoImageSubject ? `,
      "geometry": {
        "type": "triangle",
        "vertices": [{"label": "A", "x": 0, "y": 0}, {"label": "B", "x": 4, "y": 0}, {"label": "C", "x": 2, "y": 3}]
      }` : ''}
    }
  ]
}`;

    // Check if this is an English Literature worksheet
    const isEnglishLiterature = englishContext && topics[0]?.subject === 'English';

    let prompt: string;
    
    if (isEnglishLiterature && englishContext) {
      // English Literature specific prompt
      prompt = `Generate ${questionCount} high-quality reading comprehension and literary analysis questions for "${englishContext.textTitle}" by ${englishContext.author}.

CONTEXT:
- Genre: ${englishContext.genre}
- Grade Level: ${englishContext.gradeLevel}
- Themes: ${englishContext.themes.join(', ')}
- Literary Devices to Assess: ${englishContext.literaryDevices.join(', ')}
- Focus Areas: ${englishContext.focusAreas.join(', ')}
${englishContext.lessonObjectives?.length ? `- Lesson Objectives: ${englishContext.lessonObjectives.join('; ')}` : ''}

QUESTION FORMAT: ${englishContext.questionFormat}
${englishContext.questionFormat === 'multiple_choice' ? 'Generate 4 answer choices (A, B, C, D) for each question with one clearly correct answer.' : ''}
${englishContext.questionFormat === 'text_evidence' ? 'Each question should require students to cite specific evidence from the text.' : ''}
${englishContext.questionFormat === 'extended_response' ? 'Questions should prompt analysis, synthesis, and evaluation with room for developed responses.' : ''}

${includeHints ? 'Include a "hint" field for each question to guide student thinking.' : ''}
${englishContext.includeRubric ? 'Include a "rubric" field with grading criteria for each question.' : ''}
${englishContext.includeTextReferences ? 'Questions should reference specific parts of the text where possible.' : ''}

${bloomInstruction}
${difficultyInstruction}

Generate ${questionsPerTopic} questions per topic, ensuring each question:
1. Directly assesses understanding of the literary text
2. Aligns with Common Core ELA standards
3. Uses grade-appropriate vocabulary and complexity
4. Encourages critical thinking and textual analysis

Return ONLY a valid JSON array with no additional text, explanation, or markdown.
Each object must include: questionNumber, topic, standard, question, difficulty, bloomLevel, bloomVerb${includeHints ? ', hint' : ''}${includeAnswerKey ? ', answer' : ''}${englishContext.includeRubric ? ', rubric' : ''}

Example:
${exampleOutput}`;
    } else {
      // Math/Science prompt (original flow)
      prompt = `Generate ${questionCount} high-quality ${isWarmup ? 'warm-up' : 'practice'} questions across these topics:

${topicsList}

${difficultyInstruction}

${bloomInstruction}

REQUIREMENTS:
1. Generate ${questionsPerTopic} questions per topic to total ${questionCount} questions
2. Each question should be numbered sequentially from 1 to ${questionCount}
3. Include the topic name and standard in each question object
4. Write questions in complete sentences with clear, professional language
5. Vary question types: direct calculation, word problems, conceptual understanding
6. ${worksheetMode === 'diagnostic' ? 'Include advancementLevel field (A-F) for each question' : 'Ensure progressive difficulty within the topic'}
7. Every question MUST include a "bloomLevel" field (one of: remember, understand, apply, analyze, evaluate, create) and a "bloomVerb" field with the specific action verb used
${geometryInstruction}
${(includeGeometry && isGeometrySubject && !isNoImageSubject) ? GEOMETRY_METADATA_INSTRUCTION : ''}
${formulasInstruction}
${graphPaperInstruction}
${coordinateGeometryInstruction}

${diagnosticInstruction}
${variationInstruction}
${formInstruction}
${hintInstruction}
${answerKeyInstruction}

${imageFieldNote}

Return ONLY a valid JSON array with no additional text, explanation, or markdown.
Each object must include: questionNumber, topic, standard, question, difficulty, bloomLevel, bloomVerb

Example:
${exampleOutput}`;
    }

    // Use GPT-5.2 for Geometry and Physics worksheets with shapes for better diagram accuracy
    const isGeometryOrPhysics = topics.some(t =>
      t.subject?.toLowerCase() === 'geometry' || 
      t.subject?.toLowerCase() === 'physics' ||
      t.category?.toLowerCase().includes('geometry') ||
      t.category?.toLowerCase().includes('trigonometry') ||
      t.category?.toLowerCase().includes('physics')
    );
    const useAdvancedModel = isGeometryOrPhysics && (includeGeometry || useAIImages || includeCoordinateGeometry);
    
    console.log(`Worksheet generation: subjects=${topics.map(t => t.subject).join(',')}, useAdvancedModel=${useAdvancedModel}`);
    
    let content: string;
    try {
      content = await callLovableAI(prompt, useAdvancedModel);
      
      // Safety check for empty/short content
      if (!content || content.length < 50) {
        console.warn(`Primary model returned insufficient content (${content?.length} chars). Retrying with fallback...`);
        throw new Error('Insufficient content');
      }
    } catch (e) {
      console.warn("Primary AI call failed, attempting fallback to Gemini...", e);
      // Fallback to google/gemini-3-flash-preview which is fast and reliable
      content = await callLovableAI(prompt, 'google/gemini-3-flash-preview');
    }

    // Function to fix common Unicode encoding issues in math text
    function sanitizeMathText(text: string): string {
      if (!text) return text;
      
      let result = text;
      
      // Convert plain-text math notation to Unicode symbols
      result = result
        .replace(/\bpi\b(?!\s*[a-zA-Z])/gi, 'π')
        .replace(/(\d)\s*pi\b/gi, '$1π')
        .replace(/pi\/(\d)/gi, 'π/$1')
        .replace(/(\d)pi\/(\d)/gi, '$1π/$2');
      
      // Convert caret notation for exponents to superscripts
      result = result
        .replace(/\^2\b/g, '²')
        .replace(/\^3\b/g, '³')
        .replace(/\^n\b/gi, 'ⁿ');
      
      // Convert underscore subscripts for single-letter variables
      result = result
        .replace(/\b([a-zA-Z])_1\b/g, '$1₁')
        .replace(/\b([a-zA-Z])_2\b/g, '$1₂')
        .replace(/\b([a-zA-Z])_3\b/g, '$1₃')
        .replace(/\b([a-zA-Z])_n\b/gi, '$1ₙ')
        .replace(/\b([a-zA-Z])_0\b/g, '$1₀');
      
      // Comparison operators
      result = result
        .replace(/<=/g, '≤')
        .replace(/>=/g, '≥')
        .replace(/!=/g, '≠');
      
      // Clean up extra whitespace
      result = result.replace(/\s{2,}/g, ' ').trim();
      
      return result;
    }

    // Parse the JSON response with robust handling for truncated responses
    let questions: GeneratedQuestion[] = [];
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      
      // Remove markdown fences more aggressively - handle various patterns
      // Pattern 1: ```json at start
      cleanContent = cleanContent.replace(/^```json\s*/i, '');
      // Pattern 2: ``` at start (without json)
      cleanContent = cleanContent.replace(/^```\s*/, '');
      // Pattern 3: ``` at end
      cleanContent = cleanContent.replace(/\s*```\s*$/, '');
      cleanContent = cleanContent.trim();
      
      // Helper function to sanitize JSON strings (fix common AI output issues)
      function sanitizeJsonString(str: string): string {
        // Remove any BOM or weird leading characters
        str = str.replace(/^\uFEFF/, '');
        
        // Fix trailing commas before closing brackets
        str = str.replace(/,(\s*[\]}])/g, '$1');
        
        // Fix unquoted property names (common AI mistake)
        // Match property names that aren't quoted but should be
        str = str.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
        
        // Fix single quotes used instead of double quotes for property names
        str = str.replace(/'([^']+)'(\s*:)/g, '"$1"$2');
        
        // Fix single quotes used for string values (but not apostrophes in text)
        // This is tricky - only fix obvious cases like 'value' at start of value
        str = str.replace(/:\s*'([^']*?)'/g, ': "$1"');
        
        return str;
      }
      
      // Function to extract complete question objects using bracket matching
      function extractCompleteQuestions(text: string): GeneratedQuestion[] {
        const results: GeneratedQuestion[] = [];
        
        // Find the start of the questions array
        let arrayStart = -1;
        const questionsMatch = text.match(/"questions"\s*:\s*\[/);
        if (questionsMatch && questionsMatch.index !== undefined) {
          arrayStart = questionsMatch.index + questionsMatch[0].length - 1;
        } else {
          // Look for first [ that starts an array
          arrayStart = text.indexOf('[');
        }
        
        if (arrayStart === -1) return results;
        
        const arrayContent = text.substring(arrayStart);
        
        // Track bracket depth to find complete objects
        let depth = 0;
        let inString = false;
        let escape = false;
        let objectStart = -1;
        let arrayStarted = false;
        
        for (let i = 0; i < arrayContent.length; i++) {
          const char = arrayContent[i];
          
          if (escape) {
            escape = false;
            continue;
          }
          
          if (char === '\\') {
            escape = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '[' && !arrayStarted) {
              arrayStarted = true;
              continue;
            }
            if (char === '{') {
              if (depth === 0) {
                objectStart = i;
              }
              depth++;
            } else if (char === '}') {
              depth--;
              if (depth === 0 && objectStart !== -1) {
                // Found a complete object
                const objStr = arrayContent.substring(objectStart, i + 1);
                try {
                  const sanitizedObj = sanitizeJsonString(objStr);
                  const parsed = JSON.parse(sanitizedObj);
                  if (parsed && parsed.question && parsed.topic) {
                    results.push(parsed);
                  }
                } catch (e) {
                  // This object couldn't be parsed, skip it
                  console.warn(`Skipping unparseable question object at index ${results.length}`);
                }
                objectStart = -1;
              }
            }
          }
        }
        
        return results;
      }
      
      // Try to sanitize the JSON first
      let sanitizedContent = sanitizeJsonString(cleanContent);
      
      try {
        // First try standard parsing on sanitized content
        const parsed = JSON.parse(sanitizedContent);
        if (Array.isArray(parsed)) {
          questions = parsed;
        } else if (parsed && Array.isArray(parsed.questions)) {
          questions = parsed.questions;
        } else {
          throw new Error('Response is not an array or object with questions array');
        }
      } catch (e) {
        console.warn('Standard JSON parse failed, attempting recovery logic:', e);
        
        // Use the robust extraction function
        console.warn('Attempting bracket-depth recovery with individual object parsing...');
        questions = extractCompleteQuestions(sanitizedContent);
        
        if (questions.length === 0) {
          // Last resort: try to recover from original content (before sanitization)
          console.warn('Sanitized content recovery failed, trying original content...');
          questions = extractCompleteQuestions(cleanContent);
        }
        
        if (questions.length === 0) {
          throw new Error('Could not recover any complete questions from response');
        }
        
        console.log(`Recovered ${questions.length} complete questions from truncated response`);
      }
    } catch (parseError) {
      console.error('Failed to parse (or recover) AI response. Content start:', content.substring(0, 500));
      console.error('Parse error:', parseError);
      throw new Error('Failed to parse generated questions. The AI response may have been truncated or malformed. Please try again.');
    }

    // Filter out any incomplete question objects
    questions = questions.filter(q => 
      q && typeof q === 'object' && 
      q.question && typeof q.question === 'string' &&
      q.topic && typeof q.topic === 'string'
    );
    
    if (questions.length === 0) {
      throw new Error('No valid questions in response');
    }
    
    console.log(`Successfully parsed ${questions.length} questions`);
    
    // CRITICAL: Strip visual data (svg, imagePrompt) when useAIImages is false
    // This is the "Shapes OFF" mode - no diagrams should appear in the worksheet
    if (!useAIImages) {
      console.log('Shapes OFF mode: stripping svg and imagePrompt fields from all questions');
      questions = questions.map(q => {
        const { svg, imagePrompt, imageUrl, geometry, ...rest } = q;
        return rest;
      });
    }
    
    // Also strip visual data for non-image subjects (Financial Math, History, etc.)
    if (isNoImageSubject) {
      console.log('Non-image subject detected: stripping visual fields');
      questions = questions.map(q => {
        const { svg, imagePrompt, imageUrl, geometry, ...rest } = q;
        return rest;
      });
    }
    
    // Sanitize all question text to fix encoding issues
    questions = questions.map(q => ({
      ...q,
      question: sanitizeMathText(q.question),
      answer: q.answer ? sanitizeMathText(q.answer) : q.answer,
      hint: q.hint ? sanitizeMathText(q.hint) : q.hint,
      imagePrompt: q.imagePrompt ? sanitizeMathText(q.imagePrompt) : q.imagePrompt,
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Parse and Validate Geometry Metadata (P2.2)
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('Validating geometry metadata for', questions.length, 'questions...');
    let geometryValidCount = 0;
    let geometryInvalidCount = 0;
    let geometryMissingCount = 0;

    questions = questions.map((q, index) => {
      if (!q.geometry) {
        geometryMissingCount++;
        return q;
      }

      try {
        const validationResult = validateGeometryMetadata(q.geometry, {
          useExtendedBounds: false,
          strictMode: false,
        });

        if (validationResult.isValid) {
          geometryValidCount++;
          console.log(`✓ Q${q.questionNumber || index + 1}: Valid ${q.geometry.type}`);
          return { ...q, geometryValidation: validationResult };
        } else {
          geometryInvalidCount++;
          console.warn(`⚠ Q${q.questionNumber || index + 1}: Invalid geometry`);
          console.log('[GEOMETRY_ERROR]', JSON.stringify({
            q: q.questionNumber || index + 1,
            type: q.geometry.type,
            errors: validationResult.errors.map(e => e.code),
          }));
          return { ...q, geometry: undefined, geometryValidation: validationResult };
        }
      } catch (error) {
        geometryInvalidCount++;
        return { ...q, geometry: undefined };
      }
    });

    console.log('Geometry summary:', { valid: geometryValidCount, invalid: geometryInvalidCount, missing: geometryMissingCount });

    const answer_key = await generateStructuredAnswerKey(questions);
    console.log('Generated structured answer key items:', answer_key.length);

    return new Response(JSON.stringify({ questions, answer_key }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-worksheet-questions:', error);
    
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
      const typedError = error as { message: string; status: number };
      return new Response(JSON.stringify({ error: typedError.message }), {
        status: typedError.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const message = error instanceof Error ? error.message : 'Failed to generate questions';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});