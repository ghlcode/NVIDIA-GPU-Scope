import * as vscode from "vscode";
import { GpuMonitorService } from "../core/GpuMonitorService";

export class DashboardProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "gpuScope.dashboard";

  private view?: vscode.WebviewView;
  private subscription?: vscode.Disposable;

  constructor(
    private readonly monitor: GpuMonitorService,
    private readonly extensionUri: vscode.Uri
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media");
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot]
    };

    view.webview.html = this.html(view.webview);

    this.subscription?.dispose();
    this.subscription = this.monitor.onDidUpdate(() => this.sendUpdate());

    view.onDidDispose(() => {
      this.subscription?.dispose();
      this.subscription = undefined;
      this.view = undefined;
    });

    this.sendUpdate();
  }

  private sendUpdate(): void {
    if (!this.view) {
      return;
    }

    const gpus = this.monitor.gpus ?? [];
    const histories: Record<string, unknown> = {};

    for (const gpu of gpus) {
      histories[gpu.uuid] = this.monitor.getHistory(gpu.uuid);
    }

    void this.view.webview.postMessage({
      type: "gpu-update",
      gpus,
      histories,
      error: this.monitor.lastError
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = this.createNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "dashboard.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "dashboard.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="error" class="error" hidden></div>
  <div id="content"><div class="empty">Waiting for GPU data…</div></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private createNonce(): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";

    for (let index = 0; index < 32; index += 1) {
      value += characters[Math.floor(Math.random() * characters.length)];
    }

    return value;
  }
}
