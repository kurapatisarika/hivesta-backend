const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

const AI_PROMPT = `
You are a licensed senior construction estimator performing a precise plan takeoff.

Read the full PDF and extract:
- Rooms
- Area tabulation
- Windows & doors
- Plumbing
- Electrical
- Flooring
- Foundation

Return ONLY valid JSON.
`;

app.get("/", (req, res) => {
  res.send("Hivesta backend is running");
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "pdfBase64 required" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: AI_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64
                }
              },
              {
                type: "text",
                text: "Give full construction takeoff JSON"
              }
            ]
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      return res.status(500).json({ error: raw });
    }

    const parsed = JSON.parse(raw);

    const text = parsed.content
      .map((c) => c.text)
      .join("")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const finalJson = JSON.parse(text);

    res.json(finalJson);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
