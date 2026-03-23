const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Hivesta backend is running");
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: "Address is required." });
    }

    return res.json({
      property: address,
      estimatedCost: "$220,000",
      status: "Success"
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({ error: "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Hivesta backend is running on port ${PORT}`);
});
