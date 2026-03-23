const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// Increase request size limit
app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ limit: "80mb", extended: true }));

app.get("/", (req, res) => {
  res.send("Hivesta backend is running");
});

app.post("/api/analyze", async (req, res) => {
  try {
    console.log("Incoming /api/analyze request");

    const { fileName, pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "pdfBase64 is required." });
    }

    const approxBytes = Math.floor((pdfBase64.length * 3) / 4);

    console.log("File received:", fileName || "uploaded-plan.pdf");
    console.log("Approx file size bytes:", approxBytes);

    return res.json({
      status: "Success",
      message: "PDF received successfully.",
      fileName: fileName || "uploaded-plan.pdf",
      estimatedFileSizeBytes: approxBytes,
      mockEstimate: {
        totalEstimatedCost: "$220,000",
        estimatedSqft: "1,850 sqft",
        foundation: "$32,000",
        framing: "$41,000",
        roofing: "$18,000",
        electrical: "$14,500",
        plumbing: "$16,000",
        hvac: "$12,500",
        finishes: "$48,000",
        notes: [
          "This is a mock estimate for PDF upload testing.",
          "Next step is to connect Claude for real plan interpretation."
        ]
      }
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({ error: error.message || "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Hivesta backend is running on port ${PORT}`);
});
