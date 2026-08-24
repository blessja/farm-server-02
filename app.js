const express = require("express");
const cors = require("cors");

const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });
dotenv.config();
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const rowRoutes = require("./routes/rowRoutes");
const varietyRoutes = require("./routes/varietyRoutes");
const blockRoutes = require("./routes/blockRoutes");
const bunchRoutes = require("./routes/bunchRoutes");
const workerRoutes = require("./routes/workerRoutes");
const clockRoutes = require("./routes/clockRoutes");
const syncRoutes = require("./routes/sync");
const fastPieceworkRoutes = require("./routes/fastPieceworkRoutes");
const { mobileAuthMiddleware } = require("./middleware/mobileAuth");

const app = express();

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
  "http://192.168.1.101:8135",
  "http://192.168.1.101:8080",
  "https://6c469024e214.ngrok-free.app",
];

// Allow any private-network origin so DHCP IP changes don't break CORS
const privateOriginRegex =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Add this check for ngrok or other tunnels dynamically:
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Allow ngrok URLs automatically
    if (origin && origin.includes("ngrok.io")) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin) || privateOriginRegex.test(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Routes
app.use("/auth", authRoutes);
app.use("/api", mobileAuthMiddleware);
app.use("/sync", mobileAuthMiddleware);
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
app.use("/api/autoClockOutEndpoint", clockRoutes);
app.use("/api/fast-piecework", fastPieceworkRoutes);
app.use("/sync", syncRoutes);
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

module.exports = app;
