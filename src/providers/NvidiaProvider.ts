import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { GpuInfo, GpuProcess } from "../core/types";
import { GpuProvider } from "./GpuProvider";

const execFileAsync = promisify(execFile);

export class NvidiaProvider implements GpuProvider {
  readonly name = "NVIDIA";

  private get executable(): string {
    return vscode.workspace
      .getConfiguration("gpuScope")
      .get<string>("nvidiaSmiPath", "nvidia-smi");
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.executable, ["--version"], {
        timeout: 3000,
        windowsHide: true
      });
      return true;
    } catch {
      return false;
    }
  }

  async getGpus(): Promise<GpuInfo[]> {
    const fields = [
      "index",
      "uuid",
      "name",
      "utilization.gpu",
      "memory.used",
      "memory.total",
      "temperature.gpu",
      "power.draw",
      "power.limit",
      "clocks.gr",
      "clocks.mem",
      "driver_version"
    ].join(",");

    const { stdout } = await execFileAsync(
      this.executable,
      [`--query-gpu=${fields}`, "--format=csv,noheader,nounits"],
      {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      }
    );

    const gpus = String(stdout)
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line): GpuInfo => {
        const values = line.split(",").map(value => value.trim());
        const [
          index,
          uuid,
          name,
          utilization,
          memoryUsed,
          memoryTotal,
          temperature,
          powerDraw,
          powerLimit,
          coreClock,
          memoryClock,
          driverVersion
        ] = values;

        return {
          index: this.number(index) ?? 0,
          uuid: uuid || `gpu-${index}`,
          name: name || "NVIDIA GPU",
          utilization: this.number(utilization) ?? 0,
          memoryUsedMiB: this.number(memoryUsed) ?? 0,
          memoryTotalMiB: this.number(memoryTotal) ?? 0,
          temperature: this.number(temperature),
          powerDraw: this.number(powerDraw),
          powerLimit: this.number(powerLimit),
          coreClock: this.number(coreClock),
          memoryClock: this.number(memoryClock),
          driverVersion: driverVersion || undefined,
          processes: []
        };
      });

    const processes = await this.getProcesses();
    for (const gpu of gpus) {
      gpu.processes = processes.get(gpu.uuid) ?? [];
    }

    return gpus;
  }

  private async getProcesses(): Promise<Map<string, GpuProcess[]>> {
    const result = new Map<string, GpuProcess[]>();

    try {
      const { stdout } = await execFileAsync(
        this.executable,
        [
          "--query-compute-apps=gpu_uuid,pid,process_name,used_memory",
          "--format=csv,noheader,nounits"
        ],
        {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          windowsHide: true
        }
      );

      for (const line of String(stdout).trim().split(/\r?\n/).filter(Boolean)) {
        const values = line.split(",").map(value => value.trim());
        const uuid = values[0];
        const pid = this.number(values[1]);
        const processName = values.slice(2, -1).join(",") || "Unknown process";
        const memoryUsed = this.number(values[values.length - 1]);

        if (!uuid || pid === undefined) {
          continue;
        }

        const list = result.get(uuid) ?? [];
        list.push({
          pid,
          name: processName,
          memoryUsedMiB: memoryUsed
        });
        result.set(uuid, list);
      }
    } catch {
      // On some Windows/WDDM systems nvidia-smi cannot expose per-process VRAM.
      // The rest of the GPU metrics remain usable, so process collection is optional.
    }

    return result;
  }

  private number(value?: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const clean = String(value).trim();
    if (!clean || clean === "N/A" || clean === "[N/A]" || clean === "Not Supported") {
      return undefined;
    }

    const number = Number(clean);
    return Number.isFinite(number) ? number : undefined;
  }
}
