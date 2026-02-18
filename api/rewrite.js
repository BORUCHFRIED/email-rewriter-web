export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const { emailText, tone, length, language, intent } = req.body || {};
    if (!emailText || typeof emailText !== "string" || emailText.trim().length < 3) {
      res.status(400).json({ error: "Please paste an email to rewrite." });
      return;
    }

    const system = `Rewrite emails clearly and professionally while preserving meaning and facts.
Do NOT add new information, promises, prices, dates, or legal commitments.
Return ONLY valid JSON (no markdown, no extra text):
{"versions":[{"label":"Short","text":"..."},{"label":"Standard","text":"..."},{"label":"Extra Polite","text":"..."}]}`;

    const user = `Language: ${language || "English"}
Tone: ${tone || "Professional"}
Length preference: ${length || "Similar length"}
Intent: ${intent || "Reply"}

Rewrite into 3 versions: Short, Standard, Extra Polite.

EMAIL:
${emailText.trim()}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(500).json({ error: "AI request failed", details: data });
      return;
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "Model returned non-JSON", details: content.slice(0, 500) });
      return;
    }

    res.status(200).json({ versions: parsed.versions || [] });
  } catch (e) {
    res.status(500).json({ error: "Server error", details: String(e) });
  }
}
