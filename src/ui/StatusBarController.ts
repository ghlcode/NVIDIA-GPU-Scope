import * as vscode from "vscode";
import { GpuInfo, GpuMonitorState } from "../core/types";
import { GpuMonitorService } from "../core/GpuMonitorService";

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: vscode.Disposable;

  private readonly tooltipMinIntervalMs = 5000;
  private lastTooltipAt = 0;
  private lastTooltipSignature = "";

  constructor(monitor: GpuMonitorService) {
    this.item = vscode.window.createStatusBarItem(
      "gpuScope.status",
      vscode.StatusBarAlignment.Left,
      50
    );

    this.item.name = "GPU Scope";
    this.item.command = "gpuScope.openDashboard";
    this.item.text = "$(loading~spin) GPU Scope";
    this.item.tooltip = "NVIDIA GPU Scope is starting…";
    this.item.show();

    this.subscription = monitor.onDidUpdate(state => this.update(state));
  }

  private update(state: GpuMonitorState): void {
    const gpus = state.gpus ?? [];
    const error = state.error;

    if (error && gpus.length === 0) {
      this.setStatusText("$(warning) GPU Scope");
      this.setSimpleTooltip(`error:${error}`, `NVIDIA GPU Scope: ${error}`);
      return;
    }

    if (gpus.length === 0) {
      this.setStatusText("$(circle-slash) GPU Scope");
      this.setSimpleTooltip("no-gpu", "No NVIDIA GPU detected.");
      return;
    }

    this.setStatusText("$(pulse) GPU Scope");

    const signature = this.tooltipSignature(gpus);
    const now = Date.now();
    const firstTooltip = this.lastTooltipSignature === "";
    const intervalElapsed = now - this.lastTooltipAt >= this.tooltipMinIntervalMs;

    if (firstTooltip || (signature !== this.lastTooltipSignature && intervalElapsed)) {
      this.item.tooltip = this.buildTooltip(gpus);
      this.lastTooltipSignature = signature;
      this.lastTooltipAt = now;
    }
  }

  private setStatusText(text: string): void {
    if (this.item.text !== text) {
      this.item.text = text;
    }
  }

  private setSimpleTooltip(signature: string, text: string): void {
    if (this.lastTooltipSignature === signature) {
      return;
    }

    this.item.tooltip = text;
    this.lastTooltipSignature = signature;
    this.lastTooltipAt = Date.now();
  }

  private tooltipSignature(gpus: GpuInfo[]): string {
    return gpus
      .map(gpu => {
        const memoryPercent = gpu.memoryTotalMiB > 0
          ? (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100
          : 0;

        const utilizationBucket = Math.round((Number(gpu.utilization) || 0) / 5) * 5;
        const memoryBucket = Math.round(memoryPercent / 2) * 2;
        const temperatureBucket = gpu.temperature === undefined
          ? "na"
          : Math.round(gpu.temperature / 2) * 2;
        const powerBucket = gpu.powerDraw === undefined
          ? "na"
          : Math.round(gpu.powerDraw / 10) * 10;

        return [
          gpu.uuid,
          utilizationBucket,
          memoryBucket,
          temperatureBucket,
          powerBucket,
          gpu.processes.length
        ].join(":");
      })
      .join("|");
  }

  private buildTooltip(gpus: GpuInfo[]): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(
      `### NVIDIA GPU Scope — ${gpus.length} GPU${gpus.length === 1 ? "" : "s"}\n\n`
    );

    gpus.forEach((gpu, index) => {
      if (index > 0) {
        markdown.appendMarkdown("---\n\n");
      }

      const used = (gpu.memoryUsedMiB / 1024).toFixed(1);
      const total = (gpu.memoryTotalMiB / 1024).toFixed(1);
      const memoryPercent = gpu.memoryTotalMiB > 0
        ? Math.round((gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100)
        : 0;
      const temperature = gpu.temperature === undefined ? "N/A" : `${gpu.temperature}°C`;
      const power = gpu.powerDraw === undefined ? "N/A" : `${gpu.powerDraw.toFixed(0)} W`;

      markdown.appendMarkdown(`**GPU ${gpu.index} — ${gpu.name}**\n\n`);
      markdown.appendMarkdown(
        `GPU&nbsp;&nbsp;&nbsp;&nbsp;\`${this.progressBar(gpu.utilization)}\` **${Math.round(gpu.utilization)}%**\n\n`
      );
      markdown.appendMarkdown(
        `VRAM&nbsp;&nbsp;\`${this.progressBar(memoryPercent)}\` **${memoryPercent}%**  ${used} / ${total} GiB\n\n`
      );
      markdown.appendMarkdown(
        `Temperature **${temperature}** · Power **${power}** · ${gpu.processes.length} process${gpu.processes.length === 1 ? "" : "es"}\n\n`
      );
    });

    markdown.appendMarkdown("Click to open NVIDIA GPU Scope.");
    return markdown;
  }

  private progressBar(value: number): string {
    const segments = 10;
    const percent = Math.max(0, Math.min(100, Number(value) || 0));

    if (percent >= 100) {
      return "━".repeat(segments);
    }

    const position = Math.max(
      0,
      Math.min(segments - 1, Math.floor((percent / 100) * segments))
    );

    return "━".repeat(position) + "╸" + "─".repeat(segments - position - 1);
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
