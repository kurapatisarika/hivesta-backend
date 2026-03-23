const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

const AI_PROMPT = `
You are a senior construction takeoff estimator. Behave like a professional estimator, not a summarizer.

Your job is to extract precise takeoff quantities from residential construction plans.

NON-NEGOTIABLE RULES:

1. ROOM INTERIOR SQFT
- For every room, extract interior sqft using this priority:
  a) If printed sqft is shown inside the room, use it exactly.
  b) If no printed sqft is shown, calculate sqft from printed room dimensions.
  c) If dimensions are incomplete, scale from the plan only if clearly possible.
- Never leave sqft as 0 unless truly impossible.
- Add a field called "sqft_source" with one of:
  "printed", "calculated_from_dimensions", "scaled_from_plan", "missing"

2. ROOM DIMENSIONS
- Use clean wall-to-wall interior measurements where room dimensions are shown.
- Copy dimensions exactly as printed.
- Do not guess.
- If dimension is missing, write "--".

3. AREA TABULATION
- Extract area tabulation exactly as shown.
- Keep living, garage, lanai, total under roof separate.
- Do not recalculate tabulation.

4. GARAGE DOORS
- Garage doors must be returned in a separate top-level array called "garage_doors".
- Do not mix garage doors into windows_doors.
- For each garage door return:
  item, size, location, qty, ref

5. WINDOWS / DOORS / SLIDERS
- Return only non-garage openings in "windows_doors".
- Separate type values:
  "window", "entry_door", "interior_door", "sliding_door"

6. SHOWER FLOOR SQFT
- Shower floor sqft must be measured from the shower enclosure only.
- Use printed shower dimensions if available.
- If not available, scale from plan geometry.
- Never use full bathroom floor area as shower floor area.
- Add shower floor details separately in flooring.details.

7. FLOORING RULES
- Interior floor sqft = habitable room floors only.
- Bath floor sqft = actual bathroom floors.
- Shower floor sqft = shower pans only.
- Exterior tile sqft = lanai / porch / entry exterior finished areas only.
- Return separate entries for each bathroom area.

8. PROFESSIONAL TAKEOFF BEHAVIOR
- Prefer printed schedule values over guesses.
- Prefer dimension-based calculations over assumptions.
- If scaled, mark clearly.
- Never duplicate openings or rooms.

9. FOUNDATION
- Return perimeter_lf, slab_sf, wall_sf, and staged material takeoff.
- Keep refs and notes.

10. RETURN STRUCTURE
Return ONLY valid JSON with this schema:

{
  "address":"string",
  "plan_name":"string",
  "ceiling_height_ft":10,
  "area_tabulation":{"living":0,"garage":0,"lanai":0,"total_under_roof":0},
  "rooms":[
    {
      "name":"string",
      "length":"string",
      "width":"string",
      "sqft_interior":0,
      "sqft_source":"printed",
      "category":"living",
      "ref":"string"
    }
  ],
  "windows_doors":[
    {
      "item":"string",
      "size":"string",
      "location":"string",
      "qty":1,
      "type":"window",
      "ref":"string"
    }
  ],
  "garage_doors":[
    {
      "item":"string",
      "size":"string",
      "location":"string",
      "qty":1,
      "ref":"string"
    }
  ],
  "plumbing":[{"item":"string","location":"string","qty":1,"ref":"string"}],
  "electrical":[{"item":"string","location":"string","qty":1,"ref":"string"}],
  "flooring":{
    "interior_floor_sf":0,
    "bath_floor_sf":0,
    "bath_wall_tile_sf":0,
    "shower_floor_sf":0,
    "exterior_tile_sf":0,
    "details":[
      {"area":"string","type":"string","sqft":0,"ref":"string","source":"printed"}
    ]
  },
  "drywall":{"notes":"string","ref":"string"},
  "foundation":{
    "perimeter_lf":0,
    "slab_sf":0,
    "wall_sf":0,
    "stages":[
      {"stage":"Stage 1 - Footer","items":[{"activity":"string","qty":0,"unit":"string","ref":"string","note":"string"}]}
    ]
  }
}
`;

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
                text: `Analyze this residential construction plan and return only the takeoff JSON. File name: ${fileName || "uploaded-plan.pdf"}`
              }
            ]
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Anthropic API error",
        details: raw
      });
    }

    const parsed = JSON.parse(raw);
    const text = (parsed.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let resultJson;
    try {
      resultJson = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Claude returned invalid JSON.",
        rawText: text
      });
    }

    return res.json(resultJson);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({ error: error.message || "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
