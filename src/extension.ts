import * as vscode from "vscode";
import { GpuMonitorService } from "./core/GpuMonitorService";
import { NvidiaProvider } from "./providers/NvidiaProvider";
import { DashboardProvider } from "./ui/DashboardProvider";
import { StatusBarController } from "./ui/StatusBarController";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new NvidiaProvider();
  const monitor = new GpuMonitorService(provider);
  const statusBar = new StatusBarController(monitor);
  const dashboard = new DashboardProvider(monitor, context.extensionUri);

  context.subscriptions.push(
    monitor,
    statusBar,
    vscode.window.registerWebviewViewProvider(
      DashboardProvider.viewType,
      dashboard,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand("gpuScope.refresh", () => monitor.refresh()),
    vscode.commands.registerCommand("gpuScope.start", () => monitor.start()),
    vscode.commands.registerCommand("gpuScope.stop", () => monitor.stop()),
    vscode.commands.registerCommand("gpuScope.openDashboard", () =>
      vscode.commands.executeCommand("workbench.view.extension.gpuScope")
    ),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration("gpuScope.refreshInterval") ||
        event.affectsConfiguration("gpuScope.nvidiaSmiPath")
      ) {
        monitor.restart();
      }
    })
  );

  if (!(await provider.isAvailable())) {
    void vscode.window.showWarningMessage(
      "NVIDIA GPU Scope: nvidia-smi was not found in this workspace. Configure gpuScope.nvidiaSmiPath if needed."
    );
  }

  monitor.start();

  const firstRunKey = "gpuScope.v0.2.dashboardOpened";
  if (!context.globalState.get<boolean>(firstRunKey, false)) {
    await context.globalState.update(firstRunKey, true);
    setTimeout(() => {
      void vscode.commands.executeCommand("workbench.view.extension.gpuScope");
    }, 700);
  }
}

export function deactivate(): void {}
