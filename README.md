# NVIDIA GPU Scope

NVIDIA GPU Scope is a lightweight NVIDIA GPU monitor for Visual Studio Code. It displays local or remote NVIDIA GPU metrics in a compact sidebar dashboard and status-bar tooltip.

> NVIDIA GPU Scope is an independent community extension and is not affiliated with or endorsed by NVIDIA Corporation.

## Features

- Live GPU utilization with recent-history chart
- VRAM used, total capacity, and usage percentage
- GPU temperature
- Current power draw and configured power limit, such as `10W/250W`
- Multiple GPUs displayed simultaneously
- Pin any GPU to the top of the dashboard
- Compact `GPU Scope` status-bar entry
- Compact status-bar hover showing only utilization and VRAM usage
- Works as a workspace extension in Remote SSH, WSL, and Dev Containers
- No telemetry or external network requests

## Requirements

The extension reads metrics through NVIDIA's `nvidia-smi` command. It must be available in the environment where the VS Code extension host runs.

Verify the command before installation:

```bash
nvidia-smi
```

For a remote VS Code window, run the command in that remote environment. If `nvidia-smi` is installed at a non-standard location, configure `gpuScope.nvidiaSmiPath`.

## Installation

### From the VS Code Marketplace

1. Open the Extensions view in VS Code (`Ctrl+Shift+X`).
2. Search for `NVIDIA GPU Scope`.
3. Select the extension published by `ghlcode` and click **Install**.

### From a VSIX file

1. Download the latest `.vsix` package from the repository's Releases page.
2. In VS Code, open the Extensions view.
3. Select **Views and More Actions (...)** and choose **Install from VSIX...**.
4. Reload VS Code if prompted.

### Development build

```bash
npm ci
npm run check
npm run vsix
```

The generated package is written to the repository root.

## Settings

| Setting | Default | Description |
| --- | ---: | --- |
| `gpuScope.refreshInterval` | `1000` | Polling interval in milliseconds |
| `gpuScope.nvidiaSmiPath` | `nvidia-smi` | Path to the `nvidia-smi` executable |
| `gpuScope.historyLength` | `60` | Maximum number of utilization samples retained in memory |

## Commands

- `NVIDIA GPU Scope: Open Dashboard`
- `NVIDIA GPU Scope: Refresh`
- `NVIDIA GPU Scope: Start Monitoring`
- `NVIDIA GPU Scope: Stop Monitoring`

## Development

```bash
npm ci
npm run check
npm run compile
```

Open the project in VS Code and press `F5` to launch an Extension Development Host.

Project layout:

```text
src/       Extension host and GPU provider code
media/     Sidebar JavaScript, CSS, and activity-bar icon
images/    Marketplace extension icon
out/       Generated JavaScript (not committed)
```

Repository maintainers can follow `PUBLISHING.md` for the GitHub and Marketplace release checklist.

## Limitations

- Only NVIDIA GPUs supported by `nvidia-smi` are detected.
- On some Windows/WDDM systems, `nvidia-smi` cannot expose compute-process information. All other available metrics continue to update.
- Metric availability varies by GPU model, driver, and operating mode; unavailable values are shown as `N/A`.

## License

MIT — see `LICENSE`.