const DEFAULT_MAX_WORKERS = 4;

export class SatellitePropagationPool {
  constructor({ maxWorkers = DEFAULT_MAX_WORKERS } = {}) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.requestId = 0;
  }

  initialize(satellites) {
    this.terminate();

    if (typeof Worker === "undefined" || satellites.length === 0) {
      return false;
    }

    const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency || 2;
    const workerCount = Math.min(
      this.maxWorkers,
      Math.max(1, hardwareConcurrency - 1),
      satellites.length
    );
    const chunkSize = Math.ceil(satellites.length / workerCount);

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
      const startIndex = workerIndex * chunkSize;
      const workerSatellites = satellites.slice(
        startIndex,
        startIndex + chunkSize
      );

      if (workerSatellites.length === 0) break;

      const worker = new Worker(
        new URL("./satellitePropagation.worker.js", import.meta.url),
        { type: "module" }
      );
      const entry = {
        worker,
        startIndex,
        satelliteCount: workerSatellites.length,
        pendingRequests: new Map(),
        error: null,
      };

      worker.addEventListener("message", (event) =>
        this.handleWorkerMessage(entry, event)
      );
      worker.addEventListener("error", (event) =>
        this.handleWorkerError(entry, event)
      );
      this.workers.push(entry);
      worker.postMessage({
        type: "initialize",
        satrecs: workerSatellites.map((sat) => sat.satrec),
      });
    }

    return this.workers.length > 0;
  }

  propagate(date) {
    if (this.workers.length === 0) {
      return Promise.reject(new Error("Satellite worker pool is not initialized."));
    }

    const requestId = ++this.requestId;
    const timestamp = date.getTime();

    return Promise.all(
      this.workers.map(
        (entry) =>
          new Promise((resolve, reject) => {
            if (entry.error) {
              reject(entry.error);
              return;
            }

            entry.pendingRequests.set(requestId, { resolve, reject });
            entry.worker.postMessage({
              type: "propagate",
              requestId,
              timestamp,
            });
          })
      )
    );
  }

  handleWorkerMessage(entry, event) {
    if (event.data?.type !== "positions") return;

    const pending = entry.pendingRequests.get(event.data.requestId);

    if (!pending) return;

    entry.pendingRequests.delete(event.data.requestId);
    pending.resolve({
      startIndex: entry.startIndex,
      satelliteCount: entry.satelliteCount,
      positions: event.data.positions,
    });
  }

  handleWorkerError(entry, event) {
    const error = new Error(event.message || "Satellite propagation worker failed.");

    entry.error = error;
    for (const pending of entry.pendingRequests.values()) {
      pending.reject(error);
    }

    entry.pendingRequests.clear();
  }

  terminate() {
    for (const entry of this.workers) {
      for (const pending of entry.pendingRequests.values()) {
        pending.reject(new Error("Satellite propagation was cancelled."));
      }

      entry.pendingRequests.clear();
      entry.worker.terminate();
    }

    this.workers = [];
  }
}
