import { API_BASE_URL } from "../config/env";
import { getAuthToken, setAuthToken, clearAuthToken } from "../storage/authStorage";
import { enqueueAction } from "../storage/offlineQueue";

function isNetworkError(error) {
  const message = error?.message || "";
  return (
    error?.name === "TypeError" ||
    message.includes("Network request failed") ||
    message.includes("network request failed") ||
    message.includes("fetch")
  );
}

async function request(path, options = {}) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message || "Request failed";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    error.path = path;
    throw error;
  }

  return payload;
}

async function queuedMutation(path, body, queueLabel) {
  try {
    return await request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueueAction({
      path,
      method: "POST",
      body,
      queueLabel,
    });

    return {
      queued: true,
      message: `${queueLabel} saved offline and will sync automatically.`,
    };
  }
}

export const api = {
  getAuthStatus: () => request("/auth/status"),
  verifyAuth: () => request("/auth/verify"),
  login: async (body) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (result?.token) {
      await setAuthToken(result.token);
    } else if (result?.authEnabled === false) {
      await clearAuthToken();
    }

    return result;
  },
  logout: () => clearAuthToken(),
  getBlocks: () => request("/api/blocks"),
  getBlockRows: (blockName) =>
    request(`/api/block/${encodeURIComponent(blockName)}/rows`),
  getBlockDetails: (blockName) =>
    request(`/api/block/${encodeURIComponent(blockName)}`),
  getRowDetails: (blockName, rowNumber) =>
    request(
      `/api/block/${encodeURIComponent(blockName)}/row/${encodeURIComponent(
        rowNumber
      )}`
    ),
  getCurrentCheckins: () => request("/api/workers/current-checkins"),
  regularCheckin: (body) => queuedMutation("/api/checkin", body, "Regular check-in"),
  moveRegularWorker: (body) =>
    queuedMutation("/api/move-worker", body, "Move worker to correct row"),
  regularCheckout: (body) => queuedMutation("/api/checkout", body, "Regular checkout"),
  clockIn: (body) => queuedMutation("/api/clock/clockin", body, "Clock in"),
  clockOut: (body) => queuedMutation("/api/clock/clockout", body, "Clock out"),
  getClockData: () => request("/api/clock/clocks"),
  fastCheckin: (body) =>
    queuedMutation("/api/fast-piecework/fast-checkin", body, "Fast piecework"),
  getFastTotals: (query = {}) => {
    const params = new URLSearchParams();
    if (query.jobType) params.append("jobType", query.jobType);
    if (query.date) params.append("date", query.date);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/fast-piecework/fast-totals${suffix}`);
  },
  getRegularTotals: (query = {}) => {
    const params = new URLSearchParams();
    if (query.jobType) params.append("jobType", query.jobType);
    if (query.date) params.append("date", query.date);
    if (query.blockName) params.append("blockName", query.blockName);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/workers/regular-piecework-totals${suffix}`);
  },
  replayQueuedAction: (action) =>
    request(action.path, {
      method: action.method || "POST",
      body: JSON.stringify(action.body || {}),
    }),
};
