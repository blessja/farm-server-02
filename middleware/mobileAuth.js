const {
  authEnabled,
  verifyToken,
  getAuthConfigurationErrors,
} = require("../utils/mobileAuth");

function mobileAuthMiddleware(req, res, next) {
  if (!authEnabled()) {
    return next();
  }

  const configErrors = getAuthConfigurationErrors();
  if (configErrors.length > 0) {
    return res.status(500).json({
      message: "Mobile authentication is enabled but not configured correctly.",
      errors: configErrors,
    });
  }

  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization token required." });
  }

  const verification = verifyToken(token);
  if (!verification.valid) {
    return res.status(401).json({ message: verification.message });
  }

  req.mobileAuth = verification.payload;
  next();
}

module.exports = { mobileAuthMiddleware };
