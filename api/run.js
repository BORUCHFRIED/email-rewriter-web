function scenarioGuidance(scenario) {
  switch (scenario) {
    case "followup":
      return "Scenario: follow-up after no response. Be polite, short, and action-oriented. Ask one clear next step.";
    case "payment":
      return "Scenario: payment reminder. Be firm but respectful. Include one clear request and a deadline only if provided in the text.";
    case "confirm":
      return "Scenario: confirming details. Be structured. Use bullets if helpful. Do not invent missing details.";
    case "schedule":
      return "Scenario: scheduling/coordination. Suggest 2-3 time options only if requested. Otherwise ask for availability.";
    case "support":
      return "Scenario: customer support. Empathetic tone. Confirm you understand and propose the next step without overpromising.";
    case "supplier":
      return "Scenario: supplier negotiation. Professional and clear. Ask for specific terms and keep leverage polite.";
    case "general":
    default:
      return "Scenario: general professional email. Clear, concise, and friendly.";
  }
}

async function callOpenAI({ apiKey, model, temperature, system, user }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = data?.error?.message || "AI request failed";
    throw new Error(err);
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

function buildPrompt(mode, text, options = {}, selection = "") {
  const language = options.language || "English";
  const tone = options.tone || "Professional";
  const length = options.length || "Similar length";
  const summaryLength = options.summaryLength || "short";
  const translateDir = options.translateDir || "auto";

  const strictMode = !!options.strictMode;
  const whatsappMode = !!options.whatsappMode;
  const wantSubjects = !!options.subjectLines;
  const scenario = options.scenario || "general";

  if (mode === "rewrite") {
    const strict = strictMode
      ? `STRICT MODE:
- Do not change any numbers, prices, dates, times, names, addresses, phone numbers, email addresses, order numbers, or IDs.
- If something is unclear, keep it unchanged; do not guess.
`
      : "";

    const wa = whatsappMode
      ? `WHATSAPP FORMAT:
- Use short lines.
- Keep paragraphs very short (1–2 lines).
- Avoid long sentences.
`
      : "";

    return {
      label: "Rewrite",
      wantSubjects,
      system: `You rewrite text clearly and professionally while preserving meaning and facts.
Use natural punctuation and paragraphing.
Do NOT add new information, promises, prices, dates, or legal commitments.
Keep names, numbers, and key details unchanged.
Return ONLY the rewritten text. No explanations.`,
      user: `${scenarioGuidance(scenario)}

Language: ${language}
Tone: ${tone}
Length: ${length}

Length rules:
- "Shorter": condense but keep all important info.
- "Longer": improve clarity and flow without adding new facts.
- "Similar length": improve wording only.

${strict}${wa}
TEXT:
${text}`
    };
  }

  if (mode === "punctuation") {
    return {
      label: "Punctuation fixed",
      wantSubjects: false,
      system: `You fix punctuation, capitalization, spacing, and minor grammar only.
Do NOT rewrite style.
Do NOT add or remove information.
Return ONLY the corrected text. No explanations.`,
      user: `Language: ${language}

TEXT:
${text}`
    };
  }

  if (mode === "summarize") {
    return {
      label: summaryLength === "medium" ? "Summary (medium)" : "Summary (short)",
      wantSubjects: false,
      system: `You summarize text accurately without adding new facts.
Return ONLY the summary. No explanations.`,
      user: `Summary length: ${summaryLength}
- short: 3–5 bullet points max
- medium: 6–10 bullet points OR a short paragraph

TEXT:
${text}`
    };
  }

  if (mode === "translate") {
    return {
      label: "Translation",
      wantSubjects: false,
      system: `You translate text accurately and naturally.
Preserve names, numbers, and formatting.
Return ONLY the translated text. No explanations.`,
      user: `Direction: ${translateDir}
If Direction is "auto", detect source language and translate to the other (Hebrew <-> English).

TEXT:
${text}`
    };
  }

  if (mode === "edit_selection") {
    // Replace only the selected part, using context from full text
    const strict = strictMode
      ? `STRICT MODE:
- Do not change any numbers, prices, dates, times, names, addresses, phone numbers, email addresses, order numbers, or IDs.
- Keep facts unchanged; do not guess.
`
      : "";

    return {
      label: "Selection improved",
      wantSubjects: false,
      system: `You are an editing assistant.
Given FULL TEXT and a SELECTED SPAN, rewrite ONLY the selected span to improve clarity and tone.
Do NOT change meaning or facts.
Return ONLY the rewritten selected span text (no quotes, no explanations).`,
      user: `${scenarioGuidance(scenario)}

Language: ${language}
Tone: ${tone}

${strict}
FULL TEXT (for context):
${text}

SELECTED SPAN (rewrite ONLY this part):
${selection}`
    };
  }

  return {
    label: "Result",
    wantSubjects: false,
    system: "Return ONLY the result. No explanations.",
    user: text
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });

    const { mode, text, options, selection } = req.body || {};
    if (!text || typeof text !== "string" || text.trim().length < 1) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (mode === "edit_selection") {
      if (!selection || typeof selection !== "string" || selection.trim().length < 1) {
        return res.status(400).json({ error: "Missing selection" });
      }
    }

    const built = buildPrompt(mode, text.trim(), options || {}, (selection || "").trim());

    const model = "gpt-4.1-mini";
    const temperature = mode === "punctuation" ? 0.2 : 0.5;

    const output = await callOpenAI({
      apiKey: OPENAI_API_KEY,
      model,
      temperature,
      system: built.system,
      user: built.user
    });

    // Optional subject lines (second call, safer than JSON parsing)
    let subjects = [];
    if (built.wantSubjects) {
      const subj = await callOpenAI({
        apiKey: OPENAI_API_KEY,
        model,
        temperature: 0.4,
        system: `You generate email subject lines.
Return ONLY a JSON array of 3-6 subject lines. No extra text.
Example: ["Subject 1","Subject 2","Subject 3"]`,
        user: `Generate subject lines for this email:

${output}`
      });

      try {
        const arr = JSON.parse(subj);
        if (Array.isArray(arr)) subjects = arr.filter(s => typeof s === "string").slice(0, 8);
      } catch {
        subjects = [];
      }
    }

    return res.status(200).json({
      label: built.label,
      output: (output || "").trim(),
      subjects
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
