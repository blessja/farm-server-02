const express = require("express");
const {
  authEnabled,
  getSupervisorPin,
  generateToken,
  createLoginPayload,
  getAuthConfigurationErrors,
  isSupervisorAllowed,
  isSupervisorPinValid,
  normalizeSupervisorName,
  verifyToken,
} = require("../utils/mobileAuth");

const router = express.Router();

router.get("/status", (req, res) => {
  const enabled = authEnabled();
  res.json({
    authEnabled: enabled,
    configured: enabled ? getAuthConfigurationErrors().length === 0 : true,
    supervisorNameRequired: enabled,
  });
});

router.post("/login", (req, res) => {
  if (!authEnabled()) {
    return res.json({
      authEnabled: false,
      token: null,
      message: "Mobile auth is disabled on the server.",
    });
  }

  const configErrors = getAuthConfigurationErrors();
  if (configErrors.length > 0) {
    return res.status(500).json({
      message: "Mobile authentication is enabled but not configured correctly.",
      errors: configErrors,
    });
  }

  const { pin, deviceName, supervisorName } = req.body || {};
  const normalizedSupervisorName = normalizeSupervisorName(supervisorName);

  if (!normalizedSupervisorName) {
    return res.status(400).json({ message: "Supervisor name is required." });
  }

  if (!pin) {
    return res.status(400).json({ message: "PIN is required." });
  }

  if (!isSupervisorAllowed(normalizedSupervisorName)) {
    return res.status(403).json({
      message: "This supervisor is not allowed to sign in on mobile.",
    });
  }

  if (!isSupervisorPinValid(normalizedSupervisorName, pin)) {
    return res.status(401).json({ message: "Invalid PIN for this supervisor." });
  }

  const payload = createLoginPayload(deviceName, normalizedSupervisorName);
  const token = generateToken(payload);

  res.json({
    authEnabled: true,
    token,
    expiresAt: payload.exp,
    supervisorName: payload.supervisorName,
  });
});

router.get("/verify", (req, res) => {
  if (!authEnabled()) {
    return res.json({ authEnabled: false, valid: true });
  }

  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ valid: false, message: "Authorization token required." });
  }

  const verification = verifyToken(token);
  if (!verification.valid) {
    return res.status(401).json({ valid: false, message: verification.message });
  }

  return res.json({ authEnabled: true, valid: true, payload: verification.payload });
});

module.exports = router;
