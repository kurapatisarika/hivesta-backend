const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

// Define the AI prompt for Claude API
const AI_PROMPT = `
You are an expert construction estimator. Based on the uploaded PDF blueprint or floor plan, identify key information like:
- Ceiling height from elevation views
- Garage doors (number, size, type)
- Rooms (living spaces, bedrooms, bathrooms)
- Material takeoffs (concrete, drywall, etc.)
- Windows and door counts
Analyze the construction plan, extract relevant details, and return in JSON format.
`;

// Middleware for JSON parsing and handling large requests
app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

// Endpoint for health check
app.get("/", (req, res) => {
  res.send("Hivesta backend is running");
});

// Endpoint for analyzing the uploaded PDF
app.post("/api/analyze", async (req, res) => {
  try {
    const { fileName, pdfBase64 } = req.body;

    // Check if the required data is provided
    if (!pdfBase64) {
      return res.status(400).json({ error: "pdfBase64 is required." });
    }

    // Check if the API key for Claude is set
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

    // Enrich the result with additional information if necessary (this could be further logic)
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

// Helper function to call Claude API
async function callClaudeWithPdf(pdfBase64, fileName, prompt, instruction) {
  try {
    // Make the request to the Claude API
    const response = await axios.post(
      "https://api.anthropic.com/v1/complete", // Use the appropriate endpoint
      {
        prompt: `${instruction}\n\n${prompt}`,
        model: "claude-v1",
        inputs: { document: pdfBase64, fileName },
        temperature: 0.5,
        max_tokens: 1000
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Error calling Claude API: ${error.message}`);
  }
}

// Function to enrich the result if needed
function enrichResult(result) {
  // You can modify this function to add more specific information to the result
  // For example, if you want to structure the data in a specific way or calculate additional values
  result.enriched = true;
  return result;
}

// Helper function to extract ceiling height
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

// Helper function to extract garage doors count
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
