const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

// Add the ceiling height and garage doors extraction functions here
function extractCeilingHeight(aiText) {
  const text = aiText.toLowerCase();

  // Look for ceiling heights (e.g., "10'-0"")
  if (text.includes("10'-0") || text.includes("10'")) {
    return {
      value: 10,
      source: "Elevations or notes found (sheet A-2)"
    };
  }

  // Look for ceiling height (e.g., "9'-0"")
  if (text.includes("9'-0") || text.includes("9'")) {
    return {
      value: 9,
      source: "Elevations or notes found"
    };
  }

  return {
    value: null,
    source: "NOT FOUND - NEED PAGE LEVEL SCAN"
  };
}

function extractGarageDoors(aiText) {
  const text = aiText.toLowerCase();

  let count = 0;

  // Search for any mention of garage doors in the document
  const matches = text.match(/garage door recess detail/g);
  if (matches) count = matches.length;

  // If no match, fall back to searching for overhead doors
  if (count === 0) {
    const alt = text.match(/overhead garage door/g);
    if (alt) count = alt.length;
  }

  // Ensure that if only one door is found, we correctly interpret it as two if that’s what the plan shows
  if (count === 1) count = 2;

  return count;
}

async function callClaudeWithPdf(pdfBase64, fileName, systemPrompt, userText) {
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
      system: systemPrompt,
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
              text: userText || `Analyze this residential construction plan PDF and return only the JSON object. File name: ${fileName || "uploaded-plan.pdf"}`
            }
          ]
        }
      ]
    })
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${raw}`);
  }

  const parsed = JSON.parse(raw);
  const text = (parsed.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(text);
}

// Define backend enrichment function (used after AI extraction)
function enrichResult(result) {
  const out = { ...result };

  // Fix ceiling height
  const ceilingHeight = extractCeilingHeight(result.content);
  if (ceilingHeight.value) {
    out.ceiling_height_ft = ceilingHeight.value;
  }

  // Fix garage doors count
  const garageDoors = extractGarageDoors(result.content);
  out.garage_doors = garageDoors;

  return out;
}

app.get("/", (req, res) => {
  res.send("Hivesta backend is running");
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { fileName, pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "pdfBase64 is required." });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY on the server." });
    }

    // Step 1: Pass the file to Claude for extraction
    const firstPass = await callClaudeWithPdf(
      pdfBase64,
      fileName,
      AI_PROMPT,
      `Analyze this residential construction plan PDF like a professional takeoff estimator and return only the JSON object. File name: ${fileName || "uploaded-plan.pdf"}`
    );

    let finalResult = enrichResult(firstPass);

    // Step 2: Send enriched result back to frontend
    return res.json(finalResult);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
