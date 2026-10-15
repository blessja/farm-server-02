import NetInfo from "@react-native-community/netinfo";
import { API_BASE_URL } from "../config/env";
import { getAuthToken, setAuthToken, clearAuthToken } from "../storage/authStorage";
import { enqueueAction, removeQueuedAction } from "../storage/offlineQueue";

const REQUEST_TIMEOUT_MS = 12000;

// Writes are idempotent (requestId dedupe on the server), so they are allowed to
// wait out a cold boot (~30-60s on free Render) instead of being refused at the
// 12s read budget. If the phone is genuinely offline, NetInfo short-circuits
// below so the user never actually waits this long.
const WRITE_TIMEOUT_MS = 30000;

// A free-tier Render instance idles out after ~15 minutes and then needs
// 30-60s to boot on the next request. Sign-in is the one call that cannot fall
// back to the offline queue, so it gets a longer budget and a single retry.
// A read can sit in that window rather than being refused, which is why the
// timeout matters more here than anywhere else.
const AUTH_REQUEST_TIMEOUT_MS = 60000;
const AUTH_RETRY_COUNT = 1;

function isNetworkError(error) {
  const message = error?.message || "";
  return (
    error?.name === "TypeError" ||
    error?.name === "AbortError" ||
    error?.aborted === true ||
    message.includes("Network request failed") ||
    message.includes("network request failed") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("fetch")
  );
}

async function performRequest(path, fetchOptions, timeoutMs) {
  const token = await getAuthToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      // Never wait forever: treat a slow/unreachable server like an offline
      // connection so write actions queue instead of hanging the screen.
      const timeoutError = new Error("Network request failed (timed out)");
      timeoutError.name = "AbortError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

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

async function request(path, options = {}) {
  const {
    timeoutMs = REQUEST_TIMEOUT_MS,
    retryCount = 0,
    ...fetchOptions
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await performRequest(path, fetchOptions, timeoutMs);
    } catch (error) {
      lastError = error;
      // Only transport failures are worth repeating. A 401 or 500 will come
      // back identically, and a timed-out POST may already have been applied.
      if (attempt >= retryCount || !isNetworkError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

// Sign-in and the boot-time auth probes are safe to repeat and have no
// offline fallback, so they get the cold-start budget.
function authRequest(path, options = {}) {
  return request(path, {
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    retryCount: AUTH_RETRY_COUNT,
    ...options,
  });
}

// Guess whether we can reach the internet. Cached for a few seconds so every
// write doesn't pay for a native round-trip; a "false" short-circuits a write
// straight into the offline queue instead of stalling on a 12-30s timeout.
let cachedOnline = null;
let cachedOnlineAt = 0;

async function isOnline() {
  const now = Date.now();
  if (cachedOnline !== null && now - cachedOnlineAt < 3000) {
    return cachedOnline;
  }
  try {
    const state = await NetInfo.fetch();
    cachedOnline = !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    cachedOnline = true; // if we cannot tell, assume online
  }
  cachedOnlineAt = Date.now();
  return cachedOnline;
}

// Give a write a stable identity that survives an offline-queue replay. The
// server uses it to guarantee at-most-once execution: if the first attempt
// times out but the server actually applied it, the re-sent copy is answered
// with the stored response instead of moving/crediting the worker again.
function withRequestId(body) {
  if (body && typeof body.requestId === "string" && body.requestId) return body;
  return {
    ...(body || {}),
    requestId: `m-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
  };
}

async function queuedMutation(path, body, queueLabel) {
  const bodyWithId = withRequestId(body);

  if (!(await isOnline())) {
    await enqueueAction({
      path,
      method: "POST",
      body: bodyWithId,
      queueLabel,
    });
    return {
      queued: true,
      message: `${queueLabel} saved offline and will sync automatically.`,
    };
  }

  try {
    return await request(path, {
      method: "POST",
      timeoutMs: WRITE_TIMEOUT_MS,
      body: JSON.stringify(bodyWithId),
    });
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    await enqueueAction({
      path,
      method: "POST",
      body: bodyWithId,
      queueLabel,
    });

    return {
      queued: true,
      message: `${queueLabel} saved offline and will sync automatically.`,
    };
  }
}

async function queueAndPush(path, body, queueLabel) {
  const bodyWithId = withRequestId(body);

  if (!(await isOnline())) {
    const entry = await enqueueAction({
      path,
      method: "POST",
      body: bodyWithId,
      queueLabel,
    });
    return {
      queued: true,
      message: `${queueLabel} saved and will sync.`,
    };
  }

  const entry = await enqueueAction({
    path,
    method: "POST",
    body: bodyWithId,
    queueLabel,
  });

  try {
    const result = await request(path, {
      method: "POST",
      timeoutMs: WRITE_TIMEOUT_MS,
      body: JSON.stringify(bodyWithId),
    });
    await removeQueuedAction(entry.id);
    return result;
  } catch {
    return {
      queued: true,
      message: `${queueLabel} saved and will sync.`,
    };
  }
}

export const api = {
  getAuthStatus: () => authRequest("/auth/status"),
  verifyAuth: () => authRequest("/auth/verify"),
  login: async (body) => {
    const result = await authRequest("/auth/login", {
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
  getBlockInventory: async () => {
    try {
      return await request("/api/block-inventory");
    } catch (error) {
      if (error?.status !== 404) throw error;

      const blockNames = await request("/api/blocks");
      if (!Array.isArray(blockNames)) {
        throw new Error("The server returned an invalid block list.");
      }

      const blocks = await Promise.all(
        blockNames.map(async (blockName) => {
          const block = await request(
            `/api/block/${encodeURIComponent(String(blockName))}`
          );
          return {
            blockName: block?.block_name || String(blockName),
            totalVines: Number(block?.total_stocks) || 0,
            totalRows: Number(block?.total_rows) || 0,
            variety: block?.variety || "",
          };
        })
      );

      return blocks;
    }
  },
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
  getWorkers: () => request("/api/workers/list"),
  addWorker: (body) => queuedMutation("/api/workers/add", body, "Add worker"),
  regularCheckin: (body) => queuedMutation("/api/checkin", body, "Regular check-in"),
  moveRegularWorker: (body) =>
    queuedMutation("/api/move-worker", body, "Move worker to correct row"),
  swapRegularWorkers: (body) =>
    queuedMutation("/api/swap-workers", body, "Swap workers between rows"),
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
  getDayHours: async () => {
    try {
      return await request("/api/hours");
    } catch (error) {
      if (error?.status === 404) return [];
      throw error;
    }
  },
  saveDayHours: (body) =>
    queuedMutation("/api/hours/save", body, "Save day hours"),
  saveDayHoursBulk: (body) =>
    queuedMutation("/api/hours/save-bulk", body, "Save day hours"),
  deleteDayHours: (body) =>
    queuedMutation("/api/hours/delete", body, "Clear day hours"),
  replayQueuedAction: (action) =>
    request(action.path, {
      method: action.method || "POST",
      timeoutMs: WRITE_TIMEOUT_MS,
      body: JSON.stringify(action.body || {}),
    }),
};
