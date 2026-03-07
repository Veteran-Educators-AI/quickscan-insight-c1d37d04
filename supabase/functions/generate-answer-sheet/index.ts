import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Generate Answer Sheet Edge Function
 * 
 * Takes a worksheet image, extracts all questions, and produces a detailed
 * answer sheet with full solutions and work shown for each question.
 * 
 * Input:  { imageBase64: string, additionalImages?: string[] }
 * Output: { success: true, answerSheet: { questions: [...], worksheetTitle: string } }
 */

function formatImageForAI(imageBase64: string) {
  let dataUrl = imageBase64;
  if (!imageBase64.startsWith("data:")) dataUrl = `data:image/jpeg;base64,${imageBase64}`;
  return { type: "image_url", image_url: { url: dataUrl } };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64, additionalImages } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build image content array
    const imageContent: any[] = [formatImageForAI(imageBase64)];
    if (additionalImages?.length) {
      for (const img of additionalImages) {
        imageContent.push(formatImageForAI(img));
      }
    }

    const systemPrompt = `You are an expert math and academic teacher. Your job is to:

1. Look at the worksheet image(s) carefully
2. Extract EVERY question/problem from the worksheet — read each question word-for-word
3. For EACH question, produce a complete, step-by-step solution showing ALL work

IMPORTANT RULES:
- Extract the EXACT text of each question as it appears on the worksheet
- Number each question exactly as it appears (1, 2, 3, etc.)
- Show ALL mathematical steps — do not skip any
- Write the final answer clearly
- If there are sub-parts (a, b, c), solve each one separately
- Include the correct mathematical formulas used
- If a question involves a word problem, identify what is being asked first, then solve
- For multiple choice, identify the correct option AND show the work to prove it

Respond with a JSON object:
{
  "worksheet_title": "The title/header of the worksheet",
  "subject": "Math/Science/ELA/etc",
  "level": "The level if shown (e.g., Level C)",
  "total_questions": 5,
  "questions": [
    {
      "number": "1",
      "question_text": "The exact question text as written on the worksheet",
      "topic": "What concept this question tests",
      "solution_steps": [
        "Step 1: Identify what we need to find...",
        "Step 2: Set up the equation...",
        "Step 3: Solve..."
      ],
      "final_answer": "The correct final answer",
      "key_formula": "Any formula used (optional)",
      "common_mistakes": ["Common error students make on this type of problem"]
    }
  ]
}`;

    const userPrompt = `Look at this worksheet image carefully. Extract EVERY question and produce a complete answer sheet with full solutions for each one. Read each question exactly as written. Show all work and steps.`;

    console.log(`[ANSWER_SHEET] Processing ${1 + (additionalImages?.length || 0)} image(s)...`);
    const startTime = Date.now();

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              ...imageContent,
            ],
          },
        ],
        max_completion_tokens: 6000,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ANSWER_SHEET] AI error: ${response.status}`, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const latencyMs = Date.now() - startTime;

    console.log(`[ANSWER_SHEET] Generated in ${latencyMs}ms, ${content.length} chars`);

    // Parse JSON response
    let answerSheet;
    try {
      const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      answerSheet = JSON.parse(cleaned);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        answerSheet = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse answer sheet response');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        answerSheet,
        latencyMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[ANSWER_SHEET] Error:', error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Answer sheet generation failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
