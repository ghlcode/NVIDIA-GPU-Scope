# Changelog

All notable changes to NVIDIA GPU Scope are documented in this file.

## 1.0.0

- Renamed the extension and Marketplace package to NVIDIA GPU Scope.
- Added a compact multi-GPU sidebar dashboard.
- Focused dashboard cards on utilization, VRAM, temperature, and power.
- Displayed current and rated power together, for example `10W/250W`.
- Added recent utilization history and GPU pinning.
- Added a compact status-bar entry with a throttled utilization and VRAM tooltip.
- Preserved existing `gpuScope.*` settings and command identifiers.
- Added Remote SSH, WSL, and Dev Container workspace-extension support.

## 0.2.8

- Added separators between GPUs in the status-bar tooltip.
- Kept thin GPU and VRAM progress indicators in the tooltip.
- Reduced hover flicker by throttling tooltip reconstruction.
- Displayed all detected GPUs simultaneously in the dashboard.

## 0.2.7

- Replaced block-style tooltip progress bars with thin line-style bars.

## 0.2.5

- Added GPU and VRAM progress indicators to the hover tooltip.

## 0.2.4

- Kept the status bar compact with an icon and `GPU Scope` label.

## 0.2.0

- Added simultaneous multi-GPU dashboard rendering.