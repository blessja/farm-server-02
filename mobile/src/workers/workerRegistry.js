import { WORKERS_DATA } from "../../workers-data";
import { api } from "../api/client";

let serverWorkers = [];
let refreshPromise = null;

function mergeWorkers() {
  const byID = new Map();
  WORKERS_DATA.forEach((worker) => {
    if (worker && worker.workerID) {
      byID.set(String(worker.workerID).trim(), {
        workerID: String(worker.workerID).trim(),
        name: worker.name || "",
      });
    }
  });
  serverWorkers.forEach((worker) => {
    if (worker && worker.workerID) {
      byID.set(String(worker.workerID).trim(), {
        workerID: String(worker.workerID).trim(),
        name: worker.name || byID.get(String(worker.workerID).trim())?.name || "",
      });
    }
  });
  return [...byID.values()];
}

export function searchWorkers(query) {
  const all = mergeWorkers();
  if (!query) return all;
  const searchTerm = query.trim().toUpperCase();
  return all.filter(
    (worker) =>
      worker.name.toUpperCase().includes(searchTerm) ||
      String(worker.workerID).includes(searchTerm)
  );
}

export function getWorkerById(workerID) {
  const id = String(workerID || "").trim();
  if (!id) return undefined;
  return mergeWorkers().find((worker) => worker.workerID === id);
}

export function refreshServerWorkers() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = api
    .getWorkers()
    .then((list) => {
      serverWorkers = (Array.isArray(list) ? list : [])
        .map((worker) => ({
          workerID: String(worker.workerID || "").trim(),
          name: String(worker.name || worker.workerName || "").trim(),
        }))
        .filter((worker) => worker.workerID);
      return serverWorkers;
    })
    .catch(() => {
      serverWorkers = [];
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function addServerWorker(worker) {
  const id = String(worker?.workerID || "").trim();
  if (!id) return;
  serverWorkers = [
    {
      workerID: id,
      name: String(worker?.name || worker?.workerName || "").trim(),
    },
    ...serverWorkers.filter((existing) => existing.workerID !== id),
  ];
}