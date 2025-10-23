const express = require("express");
const cors = require("cors");

const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });
dotenv.config();
const connectDB = require("./config/db");
const rowRoutes = require("./routes/rowRoutes");
const varietyRoutes = require("./routes/varietyRoutes");
const blockRoutes = require("./routes/blockRoutes");
const bunchRoutes = require("./routes/bunchRoutes");
const workerRoutes = require("./routes/workerRoutes");
const clockRoutes = require("./routes/clockRoutes");
const syncRoutes = require("./routes/sync");

const app = express();
const port = 5000;

// Connect to MongoDB
connectDB();

// Middleware
// app.use(cors());
app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "https://glenoakfarm.netlify.app",
  "http://localhost:4000",
  "http://localhost:8100",
  "capacitor://localhost",
  "https://localhost",
  "ionic://localhost",
  "http://localhost:5173",
  "http://localhost:8101",
  "http://192.168.0.21:8135",
  "http://192.168.0.103:8101",
  "https://6c469024e214.ngrok-free.app",
];

// Add this check for ngrok or other tunnels dynamically:
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Allow ngrok URLs automatically
    if (origin && origin.includes("ngrok.io")) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Routes
app.use("/api", rowRoutes);
app.use("/api", clockRoutes);
app.use("/api/variety", varietyRoutes);
app.use("/api/block", blockRoutes);
app.use("/api/stocks", bunchRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/clock", clockRoutes);
app.use("/api/monitor-clockins", clockRoutes);
app.use("/api/clocks", clockRoutes);
app.use("/api/earliest-clock-in", clockRoutes);
app.use("/api/clearAllCheckins", rowRoutes);
app.use("/api/autoClockOutEndpoint", clockRoutes);
app.use("/sync", syncRoutes);
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

module.exports = app;
