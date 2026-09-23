// =============================================================================
// GENERATE NEXT DAY LESSON
// =============================================================================
// Takes the results digest for one (class, worksheet code) and builds the whole
// next-day set: lesson plan, slide deck with speaker notes, a 14-item pooled
// worksheet, and a 2-3 question exit ticket.
// Every worksheet / exit ticket item MUST carry a numeric final answer plus an
// arithmetic self-check so the client can verify the maths before showing it.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a NYC high-school mathematics teacher preparing tomorrow's lesson from today's paper-scan results.

HARD RULES
1. Use ONLY the results given. Never invent a statistic, a student, or a wrong answer. When you quote a wrong answer it must appear verbatim in the data.
2. Every worksheet item and every exit-ticket item MUST have a single NUMERIC final answer (answerNumeric) so the teacher can print a check total (the sum of the answers).
   - If the skill is "write a rule", ask for the rule AND a numeric evaluation (e.g. "write the recursive rule, then use it to find a(5)"), and make answerNumeric that value.
3. Every item MUST include a self-check: "verify" = a pure arithmetic expression using only digits . + - * / ( ) ^ and spaces, and "verifyExpected" = the number it equals. The expression must independently reproduce answerNumeric (do NOT write "answerNumeric" itself; show the computation).
4. The worksheet is ONE pooled sheet of exactly 14 items. Repair items rehearse the items the class failed (call = reteach or shaky). Nothing may hint at difficulty: no labels like "easy", "basic", "challenge", "set A", no stars.
5. Exit ticket: 2 or 3 questions, each isolating ONE skill so the next tally is clean.
6. Mathematics must be correct. Recheck each answer before you output it.
7. Use plain Unicode maths only (a(n), a₁, ×, ÷, ², −). No LaTeX, no markdown bold.

SLIDE DECK ORDER (speakerNotes required on every slide, 2-4 sentences, what the teacher says/does):
title, do-now, reteach-worked (one slide per reteach item: the item, the percentage, the wrong answers students wrote, then the correct work line by line), teaching (2-4 slides for the new lesson), independent-work, exit-ticket, debrief (2 slides, AFTER the work: what to look for, what tomorrow depends on).

Return ONLY JSON matching the schema. No commentary.`;

const SCHEMA_HINT = `{
  "lessonPlan": {
    "title": "", "aim": "", "objective": "", "standards": [""], "durationMinutes": 45,
    "builtFrom": "",
    "timeline": [{ "minutes": 5, "label": "Do Now", "detail": "" }],
    "reteach": {
      "summary": "",
      "items": [{ "itemNumber": 1, "percentCorrect": 0, "skillTag": "", "wrongAnswersQuoted": [""], "whatWentWrong": "", "howToRepair": "" }],
      "script": [""]
    },
    "materials": [""], "differentiationNotes": [""], "assessmentNote": ""
  },
  "slides": [{ "slideNumber": 1, "kind": "title|do-now|reteach-worked|teaching|independent-work|exit-ticket|debrief", "title": "", "bullets": [""], "speakerNotes": "" }],
  "worksheet": {
    "title": "", "instructions": "",
    "items": [{ "itemNumber": 1, "prompt": "", "answer": "", "answerNumeric": 0, "verify": "", "verifyExpected": 0, "skillTag": "", "isRepair": true, "errorTagIfWrong": "", "workedSolution": "" }]
  },
  "exitTicket": {
    "title": "",
    "items": [{ "itemNumber": 1, "prompt": "", "answer": "", "answerNumeric": 0, "verify": "", "verifyExpected": 0, "skillTag": "", "errorTagIfWrong": "" }]
  }
}`;

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  try {
    return JSON.parse(slice);
  } catch {
    // last-ditch bracket repair
    let repaired = slice.replace(/,\s*([}\]])/g, "$1");
    const opens = (repaired.match(/\{/g) || []).length;
    const closes = (repaired.match(/\}/g) || []).length;
    repaired += "}".repeat(Math.max(0, opens - closes));
    return JSON.parse(repaired);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { digest, classContext } = await req.json();

    if (!digest || !Array.isArray(digest.items) || digest.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No results received for this class yet — nothing to build a lesson from." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const reteach = digest.items.filter((i: any) => i.call === "reteach" || i.call === "shaky");

    const userPrompt = `CLASS
${JSON.stringify(classContext, null, 2)}

TODAY'S RESULTS (the only evidence you may use)
${JSON.stringify(digest, null, 2)}

Items needing repair (call = reteach or shaky): ${reteach.map((i: any) => `#${i.itemNumber} (${i.percentCorrect}% — ${i.skillTag || "unlabelled"})`).join(", ") || "none"}

Build tomorrow's lesson: "${classContext?.nextLessonTitle || "next lesson"}" on ${classContext?.nextLessonDate || "the next school day"}.
Return JSON in exactly this shape:
${SCHEMA_HINT}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        max_completion_tokens: 16000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `Lesson generator unavailable (${response.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || "";
    const draft = extractJson(content);

    return new Response(JSON.stringify({ draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-next-day-lesson failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
