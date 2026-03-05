import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LessonSlide {
  slideNumber: number;
  title: string;
  content: string[];
  speakerNotes: string;
  slideType: 'title' | 'objective' | 'instruction' | 'example' | 'practice' | 'summary';
}

interface LessonPlan {
  title: string;
  standard: string;
  topicName: string;
  aim: string;
  objective: string;
  duration: string;
  slides: LessonSlide[];
  recommendedWorksheets: {
    topicName: string;
    standard: string;
    difficulty: string;
  }[];
}

// Detailed Zero-Coupon Bond lesson content for enhanced generation
const ZERO_COUPON_BOND_CONTENT = `
## Zero-Coupon Bond Comprehensive Lesson

### Key Formulas:
- Purchase Price = Face Value ÷ (1 + r)^n
- Yield to Maturity (YTM) = (Face Value ÷ Purchase Price)^(1/n) - 1
- Total Gain = Face Value - Purchase Price
- ROI % = (Total Gain ÷ Purchase Price) × 100%
- Phantom Income (Annual) = Previous Value × YTM

### Example 1: Basic Price Calculation
An investor wants to buy a zero-coupon bond with a face value of $1,000 that matures in 10 years. The current yield is 5%.
Solution:
- Purchase Price = $1,000 ÷ (1.05)^10
- Purchase Price = $1,000 ÷ 1.6289
- Purchase Price = $613.91
The investor pays $613.91 and receives $1,000 at maturity.

### Example 2: Finding the Yield
An investor buys a zero-coupon bond for $750 that will pay $1,000 in 5 years. What is the YTM?
Solution:
- YTM = ($1,000 ÷ $750)^(1/5) - 1
- YTM = (1.3333)^0.2 - 1
- YTM = 1.0592 - 1 = 5.92%

### Example 3: Total Return Analysis
Purchase a 20-year zero-coupon Treasury bond with $10,000 face value for $3,769.
Solution:
- Total Gain = $10,000 - $3,769 = $6,231
- ROI = ($6,231 ÷ $3,769) × 100% = 165.3%
- Annualized Yield = ($10,000 ÷ $3,769)^(1/20) - 1 = 5.0%

### Example 4: College Savings
Parents want $25,000 for college in 15 years at 4.5% yield.
Solution:
- Price = $25,000 ÷ (1.045)^15
- Price = $25,000 ÷ 1.9353 = $12,918.71

### Example 5: Phantom Income (Tax Implications)
Buy a 5-year zero-coupon bond for $783.53 (FV=$1,000, YTM=5%).
Year 0: Value = $783.53
Year 1: Value = $783.53 × 1.05 = $822.71, Phantom Income = $39.18
Year 2: Value = $822.71 × 1.05 = $863.84, Phantom Income = $41.13
Even though no cash is received, investor owes taxes on phantom income.

### Key Vocabulary:
- Zero-Coupon Bond: Bond that pays no periodic interest, sold at discount
- Face Value: Amount received at maturity (typically $1,000)
- Discount: Difference between face value and purchase price
- Imputed Interest: Phantom income reported for taxes annually
- Accreted Value: Bond's value as it grows toward face value

### Common Misconceptions:
- Students confuse total return with annual yield
- Students forget to account for phantom income taxes
- Students may use simple interest instead of compound interest
`;

async function callLovableAI(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an expert math teacher and curriculum designer specializing in NYS Regents standards. 
          You create engaging, standards-aligned lesson plans with clear examples and practice problems.
          Your lessons follow best practices for direct instruction and include scaffolded examples.
          Always return valid JSON without markdown formatting.`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    if (response.status === 402) {
      throw new Error("CREDITS_EXHAUSTED");
    }
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Check if topic is Zero-Coupon Bonds related
function isZeroCouponBondTopic(topicName: string): boolean {
  const lowerTopic = topicName.toLowerCase();
  return lowerTopic.includes('zero-coupon') || 
         lowerTopic.includes('zero coupon') ||
         lowerTopic.includes('zerocoupon');
}

function hasExplicitExitTicket(slides: LessonSlide[]): boolean {
  return slides.some((slide) => {
    const title = slide.title?.toLowerCase() || "";
    const content = slide.content?.join(" ").toLowerCase() || "";
    return title.includes("exit ticket") || content.includes("exit ticket");
  });
}

function buildExitTicketSlide(topicName: string, standard: string, nextSlideNumber: number): LessonSlide {
  return {
    slideNumber: nextSlideNumber,
    title: "Exit Ticket",
    slideType: "summary",
    content: [
      `Exit Ticket: Show what you learned about ${topicName}.`,
      `1. Solve one problem aligned to ${standard}.`,
      `2. Explain which strategy or rule you used.`,
      "3. Write one mistake to avoid next time.",
    ],
    speakerNotes: "Use this exit ticket as the final check for mastery. Give students 3-5 minutes to work independently, then collect responses to assess understanding and plan next steps.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicName, standard, subject, relatedTopics, lessonDuration = "45 minutes" } = await req.json();

    if (!topicName || !standard) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: topicName and standard" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating lesson plan for: ${topicName} (${standard})`);

    // Add specialized content for Zero-Coupon Bonds
    const specializedContent = isZeroCouponBondTopic(topicName) 
      ? `\n\nUSE THE FOLLOWING DETAILED CONTENT AND EXAMPLES IN YOUR LESSON:\n${ZERO_COUPON_BOND_CONTENT}\n\nYou MUST include at least 5 worked examples from this content.`
      : '';

    const prompt = `Create a comprehensive PowerPoint-style lesson plan for teaching "${topicName}" aligned to NYS Regents standard ${standard}.

Subject: ${subject || 'Mathematics'}
Duration: ${lessonDuration}${specializedContent}
${relatedTopics?.length > 0 ? `Related topics to reference: ${relatedTopics.map((t: any) => t.topicName).join(', ')}` : ''}

Generate a lesson plan with the following structure as a JSON object:

{
  "title": "Lesson title (engaging and descriptive)",
  "standard": "${standard}",
  "topicName": "${topicName}",
  "aim": "A concise NYS-aligned aim statement beginning with 'Aim:'",
  "objective": "Clear, measurable learning objective using Bloom's taxonomy verbs",
  "duration": "${lessonDuration}",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Title slide",
      "content": ["Main topic title", "Standards: ${standard}", "Aim: ...", "Today's Objective"],
      "speakerNotes": "Welcome students and introduce the topic...",
      "slideType": "title"
    },
    {
      "slideNumber": 2,
      "title": "Learning Objective",
      "content": ["Aim: ...", "By the end of this lesson, you will be able to...", "Standards: ${standard}", "Key vocabulary terms"],
      "speakerNotes": "Read the objective aloud and connect it to the aim and NYS standard...",
      "slideType": "objective"
    },
    // Include 8-12 slides total covering:
    // - Prior knowledge activation (1 slide)
    // - Direct instruction with definitions and theorems (2-3 slides)
    // - Worked example 1 - step by step (1-2 slides)
    // - Worked example 2 - slightly harder (1-2 slides)
    // - Guided practice problem (1 slide)
    // - Independent practice preview (1 slide)
    // - Explicit Exit Ticket slide titled exactly "Exit Ticket" (1 slide)
    // - Summary/closure (optional)
  ],
  "recommendedWorksheets": [
    {
      "topicName": "Name of a related topic for practice",
      "standard": "Standard code",
      "difficulty": "Easy|Medium|Hard"
    }
    // Include 2-4 worksheet recommendations that align exactly to the lesson standards
  ]
}

Requirements:
1. Adhere tightly to NYS standards and keep every part of the lesson aligned to ${standard}
2. Include a clear NYS-aligned aim statement and explicitly show standards in the presentation content
3. Include an explicit final slide titled exactly "Exit Ticket" with 2-4 short student tasks
4. Include specific mathematical examples with actual numbers and solutions
5. Use proper mathematical notation (^2 for squared, sqrt() for square roots, etc.)
6. Include common misconceptions to address
7. Add engaging "Try This!" practice problems
8. Speaker notes should include timing suggestions and teaching tips
9. Recommended worksheets should directly align to the lesson's standard

Return ONLY the JSON object, no markdown formatting or code blocks.`;

    const aiResponse = await callLovableAI(prompt);
    
    // Clean up the response
    let cleanedResponse = aiResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith("```")) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    let lessonPlan: LessonPlan;
    try {
      lessonPlan = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response:", cleanedResponse);
      throw new Error("Failed to parse lesson plan from AI response");
    }

    lessonPlan = {
      ...lessonPlan,
      standard: lessonPlan.standard || standard,
      topicName: lessonPlan.topicName || topicName,
      duration: lessonPlan.duration || lessonDuration,
      aim: lessonPlan.aim?.trim() || `Aim: Students will master ${topicName} in alignment with NYS standard ${standard}.`,
      objective: lessonPlan.objective?.trim() || `Students will demonstrate understanding of ${topicName} aligned to ${standard}.`,
    };

    // Ensure recommended worksheets exist
    if (!lessonPlan.recommendedWorksheets || lessonPlan.recommendedWorksheets.length === 0) {
      lessonPlan.recommendedWorksheets = [
        { topicName, standard, difficulty: "Medium" },
      ];
    }

    if (!lessonPlan.slides || lessonPlan.slides.length === 0) {
      throw new Error("Lesson plan did not include any slides");
    }

    if (!hasExplicitExitTicket(lessonPlan.slides)) {
      lessonPlan.slides = [
        ...lessonPlan.slides,
        buildExitTicketSlide(topicName, standard, lessonPlan.slides.length + 1),
      ];
    }

    console.log(`Generated lesson plan with ${lessonPlan.slides?.length || 0} slides`);

    return new Response(
      JSON.stringify({ success: true, lessonPlan }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating lesson plan:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage === "RATE_LIMIT_EXCEEDED") {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (errorMessage === "CREDITS_EXHAUSTED") {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
