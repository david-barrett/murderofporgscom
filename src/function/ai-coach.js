export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { deckAnalysis, archetype } = body;

    // Access secret safely from Cloudflare Pages environment variables
    const apiKey = env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LLM API Key configuration on Cloudflare edge." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Call your preferred upstream LLM provider securely
    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert Star Wars: Unlimited competitive TCG strategic coach." },
          { role: "user", content: `Analyze this ${archetype} deck profile and metrics: ${JSON.stringify(deckAnalysis)}. Provide tactical feedback, curve optimization notes, and sideboarding priorities.` }
        ]
      })
    });

    const data = await llmResponse.json();
    const coachingText = data.choices?.[0]?.message?.content || "No analysis generated.";

    return new Response(JSON.stringify({ success: true, analysis: coachingText }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}