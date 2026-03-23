import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const AI_PROMPT = `You are a licensed senior construction estimator performing a precise plan takeoff. You must read every sheet, every note, every callout, every dimension, and every schedule on this PDF with extreme accuracy.

CRITICAL READING RULES - follow exactly:
1. READ EVERY SHEET: floor plan, foundation plan, electrical plan, window/door schedule, elevations, sections, details.
2. DIMENSIONS: Record exactly as shown (e.g. "15'-0""). Do not calculate or estimate. If no dimension shown, write "--".
3. SQFT PER ROOM: Use the sqft number printed on the plan next to or inside each room. Do NOT calculate from L x W dimensions. Copy the printed number exactly.
4. AREA TABULATION: This is the MASTER SOURCE OF TRUTH. Copy exactly from the plan's area tabulation box (living, garage, lanai, total under roof). These are the wall-to-wall measurements. The sum of individual room sqft will always be less than the area tabulation because rooms exclude wall thickness. NEVER change or recalculate these values.
4b. CONSISTENCY RULE: If this is the same plan model as a previously seen plan (same plan name, same room list, same dimensions), the area tabulation and room sqft values MUST be identical. Do not introduce variation between same-model plans.
5. CEILING HEIGHT: CRITICAL — Search EVERY sheet thoroughly. Do NOT default to 8ft or any assumed value.
   - PRIMARY SOURCE: Elevation sheets (Front, Rear, Left, Right elevations) — look for a dimension line showing floor-to-ceiling or floor-to-top-of-wall height.
   - SECONDARY SOURCE: Wall sections or building sections — look for "CLG HT", "CEILING HEIGHT", "PLATE HEIGHT", or a vertical dimension.
   - TERTIARY SOURCE: Floor plan notes — look for "10' CEILING", "9' CEILING", "CLG = X'-X\"" callouts anywhere on the plan.
   - QUATERNARY SOURCE: Drywall or finish notes on structural sheets.
   - If you find 10'-0" on ANY sheet, use 10. If you find 9'-0", use 9. NEVER assume 8ft unless 8ft is explicitly shown on the plans.
   - Record the exact value found and which sheet it came from in the drywall notes field.
6. WINDOWS & DOORS - CRITICAL:
   - Use ONLY the official WINDOW & DOOR SCHEDULE table on the plans. Do not count from floor plan labels or lintel notes.
   - Each ROW in the schedule = one entry. Copy the item name, size, qty exactly from that schedule row.
   - GARAGE DOORS - READ ALL THESE SOURCES AND CROSS-REFERENCE:
     SOURCE 1 - LINTEL/STRUCTURAL PLAN (Sheet S-8): Count the number of "TB-2" or "GARAGE DOOR OPENING SHALL BE SUPPORTED" callout boxes. Each separate callout = one garage door opening. This is the most reliable count.
     SOURCE 2 - FOUNDATION PLAN (Sheet FP-1): Count how many times "SEE GARAGE DOOR RECESS DETAIL" appears as separate callouts. Each = one opening.
     SOURCE 3 - FLOOR PLAN (Sheet A-1): The text label "16' OVERHEAD GARAGE DOOR" may refer to the total garage width, not individual doors. Look at the actual door symbols drawn, not just the label.
     SOURCE 4 - DOOR SCHEDULE (Sheet S-1): Check rows listed as overhead/garage door type.
     RULE: If S-8 shows 2 separate tie beam callouts for garage doors = 2 garage doors. List each as a separate entry with qty:1. The first opening is typically the larger (16' wide), the second is smaller (8' wide). Record actual sizes from the schedule or plan dimensions.
   - Type values: window, sliding_door, entry_door, interior_door, garage_door.
   - DO NOT DUPLICATE entries for the same opening, but DO create separate entries for genuinely separate openings.
7. ROOMS: List every labeled room on the floor plan. Use exact name from plan.
8. PLUMBING: Read from floor plan symbols and plumbing notes. Count each fixture symbol.
9. ELECTRICAL: Read from the electrical plan (E-1 sheet). Count each symbol per the legend. Split by device type (ceiling fan box, chandelier box, coach light, exhaust fan, smoke detector, etc.).
10. DO NOT DUPLICATE: Never create two entries for the same physical item. If a door appears once on the plan, it is qty:1 one entry.
11. NOTES & CALLOUTS: Read all notes on every sheet. Record drywall notes from structural sheets.
13. FOUNDATION - READ STRUCTURAL SHEETS (FP-1, FP-1A, S-2, S-8, GR-1):
    Calculate quantities for each stage based on plan dimensions:
    - perimeter_lf: Total linear feet of ALL foundation walls (outer perimeter + interior bearing walls). Read from foundation plan.
    - slab_sf: Total slab area from RP-1 or GR-1 (usually labeled "TOTAL SQ FEET").
    - wall_sf: perimeter_lf x ceiling height (usually 8ft for block walls above slab).
    CALCULATION FORMULAS - apply to any plan using its actual perimeter_lf and slab_sf:

    *** 10% BUFFER APPLIES ONLY TO BULK MATERIALS (concrete, blocks, sand, cement, plastic rolls) ***
    *** FIXTURES & STRUCTURAL ITEMS (lintels, window sills, rebar bars, dowels, corner rebar) = EXACT COUNT — NO BUFFER ***

    STAGE 1 FOOTER:
    - Cement CY = round(perim_lf x 0.087 x 1.10)  [+10% buffer — bulk material]
    - Cement Delivery = 3 LOADS
    - Boom Pump = 1 DAY
    - Rebars #5 20ft = round((perim_lf x 4 / 20) x 1.10) + 7 corner bars  [exact structural count]
    - Dowels #5 = round(perim_lf / 4) + count_corners + count_exterior_openings  [exact structural count]
    - Rebar Chairs = round(2 x 1.10) BOX  [+10% buffer — bulk material]
    - Rebar Ties = 1 ROLL, Plastic Rolls = round(3 x 1.10), Tape = 2 ROLL

    STAGE 2 STEM WALL:
    - Sand = round(2 x 1.10) CY  [+10% buffer — bulk material]
    - Masonry Cement = round(perim_lf x 0.087 x 1.10) BAGS  [+10% buffer — bulk material]
    - Blocks 8x16 = round((perim_lf x 12/16) x 2 courses x 1.26 waste x 1.10)  [+10% buffer — bulk material]
    - Header Blocks = round(exterior_perim_lf x 12/16 x 1.10)  [+10% buffer — bulk material]

    STAGE 3 SLAB:
    - Concrete+Fibermesh CY = round(slab_sf x (4/12) / 27 x 1.18 x 1.10)  [+10% buffer — bulk material]
    - Plastic Roll = round(3 x 1.10) EA  [+10% buffer — bulk material]
    - Concrete Pump = 1 DAY

    STAGE 4 BLOCK WALLS:
    - Sand = round(3 x 1.10) CY  [+10% buffer — bulk material]
    - Masonry Cement = round(5 x 1.10) BAGS  [+10% buffer — bulk material]
    - Regular Blocks = round((perim_lf x 12/16) x 8 courses x 1.03 waste x 1.10)  [+10% buffer — bulk material]
    - Bond Beam = round((perim_lf x 12/16) x 1.03 x 1.10) - openings_count x 2  [+10% buffer — bulk material]
    - Half Blocks = round(regular_blocks x 0.07 x 1.10)  [+10% buffer — bulk material]
    - Rebar Dowels #5 9ft6in = round(perim_lf/4) + count_corners + count_exterior_openings  [exact structural count — NO buffer]
    - Rebar #5 20ft = round((perim_lf x 2 / 20) x 1.10)  [exact structural count — NO buffer]
    - Corner Rebar 24x24 = count exterior block wall corners from floor plan  [exact structural count — NO buffer]
    - Metal Lintel Screen = 2 ROLLS, Rebar Ties = 1 ROLL
    LINTELS — EXACT COUNT FROM SCHEDULE, NO BUFFER:
    - 4ft lintels: count exactly from S-8 schedule
    - 8ft lintels: count exactly from S-8 schedule
    - 9ft-4in: count exactly from S-8 schedule
    - Large spans (15ft-4in, 17ft-4in etc): count exactly from S-8 schedule
    - Window Sills: count exactly from S-1 schedule by size
    - ref: "Sheet S-8 / S-1" for all lintels

    STAGE 5 CELL FILLS:
    - Small Rock Concrete CY = round((stage4_blocks / courses) / 3 x 2.08 x 1.10 / 27 x 1.10)  [+10% buffer — bulk material]
    - Concrete Pump = 1 DAY
    - ref: "Sheet FP-1A" (FILL EVERY CELL W/ MIN 3000PSI CONC)

    For ref field: cite exact sheet for every item.
    - LINTELS (CRITICAL - read Sheet S-8 Lintel Plan carefully):
      * Read the PRECAST LINTEL LOAD TABLE on Sheet S-8. Each window and door opening needs a lintel.
      * Lintel size = actual opening width (from floor plan dimensions) + 8in bearing each side.
      * Read EACH window/door callout on the floor plan. For each opening get the actual dimension shown.
      * PRACTICAL RULE: Use 8ft as the minimum standard lintel size for ALL windows and sliding doors regardless of opening width. Smaller sizes (4ft) are only for very small openings under 32in like awning windows and single doors. Group lintels by size and count.
      * For sliding glass doors: 8068=96in wide -> 96+16=112in -> round up = 10ft lintel. 6068=72in -> 72+16=88in -> 8ft lintel.
      * For beams spanning room widths (like tie beam over garage or large rooms): read the TIE BEAM notes on Sheet S-8. These have specific sizes like 17ft-4in (matching Living Room width), 15ft-4in (Master Bed), etc.
      * Read "SEE LINTEL PLAN" callouts on foundation plan for all lintel locations.
      * WINDOW SILLS: Count from window schedule. Note size in callout (e.g. "3060" = 3ft wide sill = "Window Sills (3ft-1in)"). Group by sill width.
    - Rebar for block walls: Read FP-1A for specific rebar quantities — Dowels #5(10ft), Dowels #5(6ft), #5 rebar 10ft, #5 rebar 20ft counts are shown in the foundation detail notes.

12. FLOORING - BATHROOM RULES (critical for ordering):
    - For each bathroom, create SEPARATE entries for each tile type.
    - Bath with WALK-IN SHOWER (no tub): entries = (a) floor tile, (b) shower wall tile full height, (c) shower floor tile. Type values: "Bath Floor Tile", "Shower Wall Tile", "Shower Floor".
    - Bath with TUB/SHOWER COMBO: entries = (a) floor tile, (b) tub surround tile ONLY (above tub rim, NOT full wall height). Type values: "Bath Floor Tile", "Tub Tile".
    - Half bath (no tub/shower): entries = (a) floor tile, (b) accent wall tile if noted. Type values: "Bath Floor Tile", "Wall Tile".
    - Area name format: "Master Bath Floor", "Master Bath Shower Walls", "Master Bath Shower Floor", "On Suite Bath Floor", "On Suite Bath Tub Surround", "Guest Bath Floor", "Guest Bath Tub Surround", "Half Bath Floor", "Half Bath Accent Walls".
    - NEVER combine tub surround and shower wall tile into one entry - they are different products ordered separately.

Return ONLY valid JSON, no markdown, no backticks:
{"address":"string","plan_name":"string","ceiling_height_ft":10,"area_tabulation":{"living":0,"garage":0,"lanai":0,"total_under_roof":0},"rooms":[{"name":"string","length":"string","width":"string","sqft_interior":0,"category":"living","ref":"string"}],"windows_doors":[{"item":"string","size":"string","location":"string","qty":1,"type":"window","ref":"string"}],"plumbing":[{"item":"string","location":"string","qty":1,"ref":"string"}],"electrical":[{"item":"string","location":"string","qty":1,"ref":"string"}],"flooring":{"interior_floor_sf":0,"bath_floor_sf":0,"bath_wall_tile_sf":0,"shower_floor_sf":0,"exterior_tile_sf":0,"details":[{"area":"string","type":"string","sqft":0,"ref":"string"}]},"drywall":{"notes":"string","ref":"string"},"foundation":{"perimeter_lf":0,"slab_sf":0,"wall_sf":0,"stages":[{"stage":"Stage 1 - Footer","items":[{"activity":"string","qty":0,"unit":"string","ref":"string","note":"string"}]}]}}`;

app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hivesta-takeoff-pro-server" });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { pdfBase64 } = req.body || {};
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY on the server." });
    }
    if (!pdfBase64) {
      return res.status(400).json({ error: "pdfBase64 is required." });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
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
                text: "Complete construction takeoff. Return ONLY the JSON object."
              }
            ]
          }
        ]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: payload?.error?.message || "Anthropic request failed.", details: payload });
    }

    const raw = (payload.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return res.status(502).json({ error: "Model returned invalid JSON.", raw });
    }

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Hivesta Takeoff Pro server running on port ${PORT}`);
});
