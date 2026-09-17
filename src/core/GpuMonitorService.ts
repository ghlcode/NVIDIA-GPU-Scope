import * as vscode from "vscode";
import { GpuInfo, GpuMonitorState, GpuSnapshot } from "./types";
import { GpuProvider } from "../providers/GpuProvider";

export class GpuMonitorService implements vscode.Disposable {
  private timer?: NodeJS.Timeout;
  private updating = false;
  private readonly history = new Map<string, GpuSnapshot[]>();
  private readonly emitter = new vscode.EventEmitter<GpuMonitorState>();

  gpus: GpuInfo[] = [];
  lastError?: string;

  readonly onDidUpdate = this.emitter.event;

  constructor(private readonly provider: GpuProvider) {}

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();
    this.resetTimer();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = undefined;
  }

  restart(): void {
    this.stop();
    this.start();
  }

  async refresh(): Promise<void> {
    if (this.updating) {
      return;
    }

    this.updating = true;

    try {
      this.gpus = await this.provider.getGpus();
      this.lastError = undefined;
      this.recordHistory(this.gpus);
      this.emitter.fire({ gpus: this.gpus, error: undefined });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitter.fire({ gpus: this.gpus, error: this.lastError });
    } finally {
      this.updating = false;
    }
  }

  getHistory(uuid: string): readonly GpuSnapshot[] {
    return this.history.get(uuid) ?? [];
  }

  private resetTimer(): void {
    const configured = vscode.workspace
      .getConfiguration("gpuScope")
      .get<number>("refreshInterval", 1000);

    const interval = Math.max(500, Number(configured) || 1000);
    this.timer = setInterval(() => void this.refresh(), interval);
  }

  private recordHistory(gpus: GpuInfo[]): void {
    const configured = vscode.workspace
      .getConfiguration("gpuScope")
      .get<number>("historyLength", 60);

    const maxSamples = Math.max(10, Math.min(600, Number(configured) || 60));
    const now = Date.now();

    for (const gpu of gpus) {
      const list = this.history.get(gpu.uuid) ?? [];
      list.push({
        timestamp: now,
        utilization: gpu.utilization,
        memoryUsedMiB: gpu.memoryUsedMiB,
        memoryTotalMiB: gpu.memoryTotalMiB,
        temperature: gpu.temperature,
        powerDraw: gpu.powerDraw
      });

      while (list.length > maxSamples) {
        list.shift();
      }

      this.history.set(gpu.uuid, list);
    }
  }

  dispose(): void {
    this.stop();
    this.emitter.dispose();
  }
}
