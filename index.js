const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

const AI_PROMPT = `
You are a senior construction takeoff estimator. Behave like a professional takeoff estimator, not a summarizer.

You are extracting quantities from residential construction plans. Accuracy is critical.

NON-NEGOTIABLE RULES

1. ROOM INTERIOR SQFT
- For every room, determine interior sqft using this priority:
  a) If printed sqft is shown inside the room, use it exactly.
  b) If no printed sqft is shown, calculate sqft from printed interior dimensions.
  c) If dimensions are incomplete, scale from the plan only if clearly possible.
- Never leave sqft as 0 unless truly impossible.
- Add "sqft_source" using one of:
  "printed", "calculated_from_dimensions", "scaled_from_plan", "missing"

2. ROOM DIMENSIONS
- Use clean wall-to-wall interior dimensions where shown.
- Copy dimensions exactly as printed.
- If missing, write "--".

3. ROOM CEILING NOTES
- If a room label shows something like "8'-8\\" CLG", store that as a room-level field called "ceiling_note".
- Do NOT convert room-level CLG notes into the project-wide ceiling height.

4. GLOBAL CEILING HEIGHT
- Project-wide "ceiling_height_ft" must come only from general notes, sections, elevations, wall sections, or ceiling schedules.
- Do NOT use individual room CLG notes as the global ceiling height.
- If no true global ceiling height is clearly found, set "ceiling_height_ft" to null.

5. AREA TABULATION
- Extract area tabulation exactly as shown.
- Keep living, garage, lanai, total under roof separate.
- Do not recalculate tabulation.

6. WINDOWS / DOORS / SLIDERS
- Return non-garage openings only in "windows_doors".
- Type values allowed:
  "window", "entry_door", "interior_door", "sliding_door"
- Do not mix garage doors here.

7. GARAGE DOORS
- Garage doors must be returned in a separate top-level array called "garage_doors".
- For each garage door return:
  item, size, location, qty, ref

8. SHOWER FLOOR SQFT
- Shower floor sqft must come only from the shower enclosure / shower pan.
- Use exact printed shower dimensions if shown.
- If not shown, calculate or scale only the shower enclosure area.
- Never use full bathroom floor area as shower floor sqft.
- Never combine tub area with shower floor.

9. SHOWER WALL TILE
- Shower wall tile area must include only tiled wall faces inside the shower enclosure.

10. TUB SURROUND TILE
- For baths with tubs, wall tile area must be measured above the tub rim only.
- Deduct tub height from full wall height.
- Return tub surround tile separately in flooring.details with type "Tub Tile".

11. BATHROOM FLOORING RULES
- Interior floor sqft = habitable interior floors only.
- Bath floor sqft = actual bathroom floor areas.
- Shower floor sqft = shower pans only.
- Exterior tile sqft = lanai / porch / entry exterior finished areas only.

12. PLUMBING
- Extract plumbing fixtures from plan symbols and notes.

13. ELECTRICAL
- Extract electrical devices from electrical plans and notes.

14. FOUNDATION
- Foundation must be returned only in a clean stage-by-stage format.
- Keep these stages if present:
  Stage 1 - Footer
  Stage 2 - Stem Wall
  Stage 3 - Slab Pour
  Stage 4 - Block Walls
  Stage 5 - Cell Fills

15. PROFESSIONAL TAKEOFF BEHAVIOR
- Prefer printed plan values over assumptions.
- Prefer calculated values from printed dimensions over scaling.
- Use scaling only when required.
- Never duplicate rooms or openings.
- Be disciplined and estimator-grade.

RETURN ONLY VALID JSON
No markdown, no backticks, no commentary.

Use this exact schema:

{
  "address":"string",
  "plan_name":"string",
  "ceiling_height_ft": null,
  "area_tabulation":{"living":0,"garage":0,"lanai":0,"total_under_roof":0},
  "rooms":[{"name":"string","length":"string","width":"string","sqft_interior":0,"sqft_source":"printed","category":"living","ceiling_note":"string","ref":"string"}],
  "windows_doors":[{"item":"string","size":"string","location":"string","qty":1,"type":"window","ref":"string"}],
  "garage_doors":[{"item":"string","size":"string","location":"string","qty":1,"ref":"string"}],
  "plumbing":[{"item":"string","location":"string","qty":1,"ref":"string"}],
  "electrical":[{"item":"string","location":"string","qty":1,"ref":"string"}],
  "flooring":{"interior_floor_sf":0,"bath_floor_sf":0,"bath_wall_tile_sf":0,"shower_floor_sf":0,"exterior_tile_sf":0,"details":[{"area":"string","type":"string","sqft":0,"source":"printed","ref":"string"}]},
  "bathrooms":[{"name":"string","bath_type":"walk_in_shower","floor_sqft":0,"floor_sqft_source":"printed","shower_floor_sqft":0,"shower_floor_source":"printed","shower_wall_tile_sqft":0,"shower_wall_tile_source":"printed","tub_tile_sqft":0,"tub_tile_source":"printed","ref":"string"}],
  "drywall":{"notes":"string","ref":"string"},
  "foundation":{"perimeter_lf":0,"slab_sf":0,"wall_sf":0,"stages":[{"stage":"Stage 1 - Footer","items":[{"activity":"string","qty":0,"unit":"string","ref":"string","note":"string"}]}]}
}
`;

function dimToFeet(dim) {
  if (!dim || typeof dim !== "string" || dim === "--") return null;
  const cleaned = dim.trim();
  const match = cleaned.match(/(\d+)\s*'\s*-?\s*(\d+)?\s*"?/);
  if (!match) return null;
  const feet = Number(match[1] || 0);
  const inches = Number(match[2] || 0);
  return feet + inches / 12;
}

function calcSqftFromDims(length, width) {
  const l = dimToFeet(length);
  const w = dimToFeet(width);
  if (l == null || w == null) return null;
  return Math.round(l * w);
}

function normalizeRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  const seen = new Set();

  return rooms
    .map((r) => {
      const room = { ...r };
      const key = `${room.name || ""}|${room.length || ""}|${room.width || ""}|${room.ref || ""}`.toLowerCase();

      if (!room.sqft_interior || Number(room.sqft_interior) === 0) {
        const calc = calcSqftFromDims(room.length, room.width);
        if (calc) {
          room.sqft_interior = calc;
          room.sqft_source = "calculated_from_dimensions";
        } else {
          room.sqft_source = room.sqft_source || "missing";
        }
      }

      return { room, key };
    })
    .filter(({ key }) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ room }) => room);
}

function normalizeGarageDoors(garageDoors, windowsDoors) {
  const gd = Array.isArray(garageDoors) ? [...garageDoors] : [];
  const wd = Array.isArray(windowsDoors) ? windowsDoors : [];

  const moved = wd.filter((x) => {
    const text = `${x.item || ""} ${x.type || ""} ${x.location || ""}`.toLowerCase();
    return text.includes("garage");
  });

  moved.forEach((m) => {
    gd.push({
      item: m.item || "Garage Door",
      size: m.size || "--",
      location: m.location || "Garage",
      qty: Number(m.qty) || 1,
      ref: m.ref || "--"
    });
  });

  const filtered = wd.filter((x) => {
    const text = `${x.item || ""} ${x.type || ""} ${x.location || ""}`.toLowerCase();
    return !text.includes("garage");
  });

  const mergedMap = new Map();
  gd.forEach((g) => {
    const key = `${g.item || ""}|${g.size || ""}|${g.location || ""}|${g.ref || ""}`.toLowerCase();
    if (!mergedMap.has(key)) {
      mergedMap.set(key, { ...g, qty: Number(g.qty) || 1 });
    } else {
      const ex = mergedMap.get(key);
      ex.qty += Number(g.qty) || 1;
    }
  });

  return {
    garageDoors: Array.from(mergedMap.values()),
    windowsDoors: filtered
  };
}

function normalizeBathrooms(bathrooms) {
  if (!Array.isArray(bathrooms)) return [];
  return bathrooms.map((b) => {
    const x = { ...b };

    if ((!x.floor_sqft || x.floor_sqft === 0) && x.floor_sqft_source !== "printed") {
      x.floor_sqft_source = x.floor_sqft_source || "missing";
    }

    if ((!x.shower_floor_sqft || x.shower_floor_sqft === 0) && x.shower_floor_source !== "printed") {
      x.shower_floor_source = x.shower_floor_source || "missing";
    }

    if ((!x.shower_wall_tile_sqft || x.shower_wall_tile_sqft === 0) && x.shower_wall_tile_source !== "printed") {
      x.shower_wall_tile_source = x.shower_wall_tile_source || "missing";
    }

    if ((!x.tub_tile_sqft || x.tub_tile_sqft === 0) && x.tub_tile_source !== "printed") {
      x.tub_tile_source = x.tub_tile_source || "missing";
    }

    return x;
  });
}

function normalizeFoundation(foundation) {
  const f = foundation && typeof foundation === "object" ? { ...foundation } : {};
  if (!Array.isArray(f.stages)) f.stages = [];

  f.stages = f.stages.map((stage, idx) => ({
    stage: stage.stage || `Stage ${idx + 1}`,
    items: Array.isArray(stage.items) ? stage.items : []
  }));

  return f;
}

function enrichResult(result) {
  const out = { ...result };

  out.rooms = normalizeRooms(out.rooms);

  const fixedOpenings = normalizeGarageDoors(out.garage_doors, out.windows_doors);
  out.garage_doors = fixedOpenings.garageDoors;
  out.windows_doors = fixedOpenings.windowsDoors;

  out.bathrooms = normalizeBathrooms(out.bathrooms);
  out.foundation = normalizeFoundation(out.foundation);

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
                text: `Analyze this residential construction plan PDF like a professional takeoff estimator and return only the JSON object. File name: ${fileName || "uploaded-plan.pdf"}`
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

    const finalResult = enrichResult(resultJson);
    return res.json(finalResult);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
