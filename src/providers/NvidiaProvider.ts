import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { GpuInfo, GpuProcess } from "../core/types";
import { GpuProvider, GpuProviderProbe } from "./GpuProvider";

interface CommandOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}

/**
 * Every metric the dashboard can display. Some drivers reject part of this list
 * ("Field "power.draw" is not a valid field to query."), so the query degrades
 * to {@link BASIC_FIELDS} instead of failing outright.
 */
const ALL_FIELDS = [
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
] as const;

/** Metrics every nvidia-smi build supporting --query-gpu understands. */
const BASIC_FIELDS = [
  "index",
  "uuid",
  "name",
  "utilization.gpu",
  "memory.used",
  "memory.total"
] as const;

const CSV_FORMAT = "--format=csv,noheader,nounits";
const MAX_DETAIL_LENGTH = 300;

export class NvidiaProvider implements GpuProvider {
  readonly name = "NVIDIA";

  private workingFields?: readonly string[];
  private cachedForExecutable?: string;

  private get executable(): string {
    return vscode.workspace
      .getConfiguration("gpuScope")
      .get<string>("nvidiaSmiPath", "nvidia-smi");
  }

  private get timeoutMs(): number {
    const configured = vscode.workspace
      .getConfiguration("gpuScope")
      .get<number>("queryTimeout", 15000);

    const value = Number(configured);
    if (!Number.isFinite(value)) {
      return 15000;
    }

    return Math.min(60000, Math.max(1000, value));
  }

  async probe(): Promise<GpuProviderProbe> {
    const executable = this.executable;
    const timeoutMs = Math.min(5000, this.timeoutMs);
    const outcome = await this.run(["--version"], timeoutMs);

    if (outcome.code === 0) {
      return { ok: true };
    }

    const detail = this.describe(outcome, timeoutMs);
    const hint = this.hintFor(outcome, detail);

    return {
      ok: false,
      message: [`${executable} is not usable: ${detail}`, hint]
        .filter(Boolean)
        .join(" ")
    };
  }

  async isAvailable(): Promise<boolean> {
    return (await this.probe()).ok;
  }

  async getGpus(): Promise<GpuInfo[]> {
    const { fields, rows } = await this.queryGpuRows();

    const gpus = rows.map((values): GpuInfo => {
      const read = (field: string): string | undefined => {
        const position = fields.indexOf(field);
        return position >= 0 ? values[position] : undefined;
      };

      const index = read("index");
      const uuid = read("uuid");
      const name = read("name");

      return {
        index: this.number(index) ?? 0,
        uuid: uuid || `gpu-${index ?? "0"}`,
        name: name || "NVIDIA GPU",
        utilization: this.number(read("utilization.gpu")) ?? 0,
        memoryUsedMiB: this.number(read("memory.used")) ?? 0,
        memoryTotalMiB: this.number(read("memory.total")) ?? 0,
        temperature: this.number(read("temperature.gpu")),
        powerDraw: this.number(read("power.draw")),
        powerLimit: this.number(read("power.limit")),
        coreClock: this.number(read("clocks.gr")),
        memoryClock: this.number(read("clocks.mem")),
        driverVersion: read("driver_version") || undefined,
        processes: []
      };
    });

    const processes = await this.getProcesses();
    for (const gpu of gpus) {
      gpu.processes = processes.get(gpu.uuid) ?? [];
    }

    return gpus;
  }

  private async queryGpuRows(): Promise<{
    fields: readonly string[];
    rows: string[][];
  }> {
    const executable = this.executable;

    if (this.cachedForExecutable !== executable) {
      this.workingFields = undefined;
      this.cachedForExecutable = executable;
    }

    const attempts: readonly (readonly string[])[] = this.workingFields
      ? [this.workingFields]
      : [ALL_FIELDS, BASIC_FIELDS];

    const failures: string[] = [];
    let lastOutcome: CommandOutcome | undefined;
    let lastDetail = "";

    for (const fields of attempts) {
      const outcome = await this.run([
        `--query-gpu=${fields.join(",")}`,
        CSV_FORMAT
      ]);
      lastOutcome = outcome;

      if (outcome.code === 0) {
        const rows = parseCsv(outcome.stdout);

        if (rows.length > 0) {
          this.workingFields = fields;
          return { fields, rows };
        }

        lastDetail = `no GPUs reported (exit code 0, empty output)`;
        failures.push(lastDetail);
        continue;
      }

      lastDetail = this.describe(outcome);
      const scope = fields === ALL_FIELDS ? "full query" : "basic query";
      failures.push(`${scope} failed: ${lastDetail}`);
    }

    const summary = failures.length > 1
      ? `${failures[0]}\nFallback without optional metrics also failed: ${failures[failures.length - 1]}`
      : failures[0] ?? "nvidia-smi produced no output";

    const hint = lastOutcome ? this.hintFor(lastOutcome, lastDetail) : undefined;

    throw new Error(
      [summary, hint, `Executable: ${this.executable}`].filter(Boolean).join("\n")
    );
  }

  private async getProcesses(): Promise<Map<string, GpuProcess[]>> {
    const result = new Map<string, GpuProcess[]>();

    const outcome = await this.run([
      "--query-compute-apps=gpu_uuid,pid,process_name,used_memory",
      CSV_FORMAT
    ]);

    if (outcome.code !== 0) {
      // On some Windows/WDDM systems nvidia-smi cannot expose per-process VRAM.
      // The rest of the GPU metrics remain usable, so process collection is optional.
      return result;
    }

    for (const values of parseCsv(outcome.stdout)) {
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

    return result;
  }

  private run(args: readonly string[], timeoutMs = this.timeoutMs): Promise<CommandOutcome> {
    return new Promise(resolve => {
      execFile(
        this.executable,
        [...args],
        {
          timeout: timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          encoding: "utf8"
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({
              code: 0,
              signal: null,
              stdout: String(stdout ?? ""),
              stderr: String(stderr ?? ""),
              timedOut: false
            });
            return;
          }

          const failure = error as NodeJS.ErrnoException & {
            signal?: NodeJS.Signals;
            killed?: boolean;
          };

          resolve({
            code: typeof failure.code === "number" ? failure.code : null,
            signal: failure.signal ?? null,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            timedOut: failure.killed === true,
            spawnError: typeof failure.code === "string" ? failure.message : undefined
          });
        }
      );
    });
  }

  /**
   * nvidia-smi reports query errors on stdout with an empty stderr, so the raw
   * child-process error ("Command failed: …") hides the only useful detail.
   */
  private describe(outcome: CommandOutcome, timeoutMs = this.timeoutMs): string {
    if (outcome.spawnError) {
      return outcome.spawnError;
    }

    if (outcome.timedOut) {
      return `timed out after ${timeoutMs} ms`;
    }

    const status = outcome.code === null
      ? `signal ${outcome.signal ?? "unknown"}`
      : `exit code ${outcome.code}`;

    const detail = this.outputDetail(outcome);
    return detail ? `${status}: ${detail}` : status;
  }

  private outputDetail(outcome: CommandOutcome): string {
    const lines = `${outcome.stdout}\n${outcome.stderr}`
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    const unique = [...new Set(lines)];
    const detail = unique.join(" ");

    return detail.length > MAX_DETAIL_LENGTH
      ? `${detail.slice(0, MAX_DETAIL_LENGTH)}…`
      : detail;
  }

  private hintFor(outcome: CommandOutcome, detail: string): string | undefined {
    const lower = detail.toLowerCase();

    if (outcome.spawnError) {
      return 'Check the gpuScope.nvidiaSmiPath setting and set it to the full path of nvidia-smi.';
    }

    if (outcome.timedOut) {
      return 'The GPU may be waking from a low-power state; retry or raise the gpuScope.queryTimeout setting.';
    }

    if (lower.includes("no devices were found") || outcome.code === 6) {
      return "nvidia-smi cannot see a GPU in this environment. This is common in WSL, containers, or Remote SSH sessions without GPU access.";
    }

    if (lower.includes("not a valid field")) {
      return "This driver does not support every queried metric. NVIDIA GPU Scope retried with the basic metrics.";
    }

    if (lower.includes("insufficient permissions") || lower.includes("permission denied")) {
      return "The current user cannot access the GPU.";
    }

    if (lower.includes("couldn't find") || lower.includes("failed to initialize")) {
      return "The driver did not respond. Check that the NVIDIA driver is loaded and matches the GPU.";
    }

    return undefined;
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

/** Splits one CSV row, honouring quoted values so names keep their commas. */
function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values.map(value => value.trim());
}

function parseCsv(output: string): string[][] {
  return String(output)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(parseCsvRow);
}
