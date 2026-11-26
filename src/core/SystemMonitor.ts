import * as fs from "fs";
import * as os from "os";
import { SystemStats } from "./types";

interface CpuTicks {
  idle: number;
  total: number;
}

interface CpuSample {
  ticks: CpuTicks;
  at: number;
}

/**
 * Samples host CPU and memory usage.
 *
 * CPU load is derived from the delta of the cumulative tick counters reported by
 * `os.cpus()`, so two samples are needed before a meaningful value is available.
 * This measures the machine that hosts the extension (the remote host when using
 * Remote SSH), which matches the machine serving `nvidia-smi` data.
 */
export class SystemMonitor {
  /** Below this window the tick delta is too coarse to be representative. */
  private static readonly minWindowMs = 200;

  private readonly coreCount = Math.max(1, os.cpus().length);
  private previous: CpuSample;
  private lastCpuUsage = 0;

  constructor() {
    this.previous = { ticks: this.readTicks(), at: Date.now() };
  }

  sample(): SystemStats {
    const memoryTotalBytes = os.totalmem();
    const memoryFreeBytes = this.readAvailableMemoryBytes() ?? os.freemem();
    const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryFreeBytes);

    return {
      cpuUsagePercent: this.readCpuUsage(),
      cpuCoreCount: this.coreCount,
      memoryUsedBytes,
      memoryTotalBytes,
      memoryUsagePercent:
        memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0
    };
  }

  private readCpuUsage(): number {
    const current: CpuSample = { ticks: this.readTicks(), at: Date.now() };
    const previous = this.previous;
    this.previous = current;

    const totalDelta = current.ticks.total - previous.ticks.total;
    const idleDelta = current.ticks.idle - previous.ticks.idle;

    // Too short a window yields tick quantization noise (often a false 0% or
    // 100%), so keep the previous reading instead of publishing it.
    if (totalDelta <= 0 || current.at - previous.at < SystemMonitor.minWindowMs) {
      return this.lastCpuUsage;
    }

    const usage = (1 - idleDelta / totalDelta) * 100;
    this.lastCpuUsage = Math.round(Math.max(0, Math.min(100, usage)) * 10) / 10;
    return this.lastCpuUsage;
  }

  private readTicks(): CpuTicks {
    let idle = 0;
    let total = 0;

    for (const cpu of os.cpus()) {
      idle += cpu.times.idle;
      total +=
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.idle +
        cpu.times.irq;
    }

    return { idle, total };
  }

  /**
   * Linux counts page cache as used memory by `os.freemem()`, which makes a
   * healthy host look full. Prefer `MemAvailable` from /proc/meminfo when it is
   * readable; other platforms (and failures) fall back to the OS value.
   */
  private readAvailableMemoryBytes(): number | undefined {
    try {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
      const match = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo);

      if (!match) {
        return undefined;
      }

      const availableKb = Number(match[1]);
      return Number.isFinite(availableKb) ? availableKb * 1024 : undefined;
    } catch {
      return undefined;
    }
  }
}
