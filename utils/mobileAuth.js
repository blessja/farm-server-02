const crypto = require("crypto");

function authEnabled() {
  return String(process.env.MOBILE_AUTH_ENABLED || "").toLowerCase() === "true";
}

function getSecret() {
  return process.env.MOBILE_AUTH_SECRET || "";
}

function getPin() {
  return process.env.MOBILE_AUTH_PIN || "";
}

function parseSupervisorPinMap() {
  const raw = process.env.MOBILE_AUTH_SUPERVISOR_PINS || "";

  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }

      const supervisorName = normalizeSupervisorName(
        entry.slice(0, separatorIndex)
      );
      const pin = entry.slice(separatorIndex + 1).trim();

      if (!supervisorName || !pin) {
        return null;
      }

      return { supervisorName, pin };
    })
    .filter(Boolean);
}

function getAuthConfigurationErrors() {
  const errors = [];
  const supervisorPinMap = parseSupervisorPinMap();

  if (authEnabled() && !getPin() && supervisorPinMap.length === 0) {
    errors.push(
      "Set MOBILE_AUTH_PIN or MOBILE_AUTH_SUPERVISOR_PINS for mobile auth."
    );
  }

  if (authEnabled() && !getSecret()) {
    errors.push("MOBILE_AUTH_SECRET is missing.");
  }

  return errors;
}

function normalizeSupervisorName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isSupervisorAllowed(supervisorName) {
  const normalized = normalizeSupervisorName(supervisorName);
  const allowed = parseSupervisorPinMap().map((entry) => entry.supervisorName);

  if (!normalized) {
    return false;
  }

  if (!allowed.length) {
    return true;
  }

  return allowed.some(
    (item) => item.toLowerCase() === normalized.toLowerCase()
  );
}

function getSupervisorPin(supervisorName) {
  const normalized = normalizeSupervisorName(supervisorName);
  const supervisorPinMap = parseSupervisorPinMap();
  const found = supervisorPinMap.find(
    (entry) => entry.supervisorName.toLowerCase() === normalized.toLowerCase()
  );

  return found ? found.pin : null;
}

function isSupervisorPinValid(supervisorName, pin) {
  const supervisorPin = getSupervisorPin(supervisorName);

  if (supervisorPin) {
    return supervisorPin === String(pin || "").trim();
  }

  return String(pin || "").trim() === getPin();
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function sign(content) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(content)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");

    if (!encodedHeader || !encodedPayload || !signature) {
      return { valid: false, message: "Malformed token." };
    }

    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
    if (signature !== expectedSignature) {
      return { valid: false, message: "Invalid token signature." };
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return { valid: false, message: "Token has expired." };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, message: "Could not verify token." };
  }
}

function createLoginPayload(deviceName, supervisorName) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 60 * 60 * 24 * 7;
  const normalizedSupervisorName = normalizeSupervisorName(supervisorName);

  return {
    sub: "farm-mobile-user",
    deviceName: deviceName || "unknown-device",
    supervisorName: normalizedSupervisorName,
    iat: issuedAt,
    exp: expiresAt,
  };
}

module.exports = {
  authEnabled,
  getPin,
  getSupervisorPin,
  isSupervisorPinValid,
  isSupervisorAllowed,
  normalizeSupervisorName,
  generateToken,
  verifyToken,
  createLoginPayload,
  getAuthConfigurationErrors,
};
