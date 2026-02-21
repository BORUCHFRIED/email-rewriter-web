function buildPrompt(mode, text, options = {}) {
  const language = options.language || "English";
  const tone = options.tone || "Professional";
  const length = options.length || "Similar length";
  const summaryLength = options.summaryLength || "short";
  const translateDir = options.translateDir || "auto";

  if (mode === "rewrite") {
    return {
      label: "Rewrite",
      system: `You rewrite emails clearly and professionally while preserving meaning and facts.
Use natural punctuation and paragraphing.
Do NOT add new information, promises, prices, dates, or legal commitments.
Keep names, numbers, and key details unchanged.
Return ONLY the rewritten text. No explanations.`,
      user: `Language: ${language}
Tone: ${tone}
Length: ${length}

If Length is "Shorter" → condense but keep all important info.
If "Longer" → improve clarity and flow without adding new facts.
If "Similar length" → improve wording only.

TEXT:
${text}`
    };
  }

  if (mode === "punctuation") {
    return {
      label: "Punctuation fixed",
      system: `You fix punctuation, capitalization, spacing, and minor grammar only.
Do NOT change wording unless required for grammar.
Do NOT add or remove information.
Return ONLY the corrected text. No explanations.`,
      user: `TEXT:
${text}`
    };
  }

  if (mode === "summarize") {
    return {
      label: summaryLength === "medium" ? "Summary (medium)" : "Summary (short)",
      system: `You summarize text accurately without adding new facts.
Return ONLY the summary. No explanations.`,
      user: `Summary length: ${summaryLength}.
- short: 3-5 bullet points max
- medium: 6-10 bullet points or a short paragraph

TEXT:
${text}`
    };
  }

  if (mode === "translate") {
    return {
      label: "Translation",
      system: `You translate text accurately and naturally.
Preserve names, numbers, and formatting.
Return ONLY the translated text. No explanations.`,
      user: `Direction: ${translateDir}
If Direction is "auto", detect source language and translate to the other (Hebrew <-> English).

TEXT:
${text}`
    };
  }

  return {
    label: "Result",
    system: "Return ONLY the result. No explanations.",
    user: text
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });

    const { mode, text, options } = req.body || {};
    if (!text || typeof text !== "string" || text.trim().length < 1) {
      return res.status(400).json({ error: "Missing text" });
    }

    const { system, user, label } = buildPrompt(mode, text.trim(), options);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(500).json({ error: "AI request failed", details: data });

    const output = data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ label, output });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
