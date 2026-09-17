export interface GpuProcess {
  pid: number;
  name: string;
  memoryUsedMiB?: number;
}

export interface GpuInfo {
  index: number;
  uuid: string;
  name: string;
  utilization: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  temperature?: number;
  powerDraw?: number;
  powerLimit?: number;
  coreClock?: number;
  memoryClock?: number;
  driverVersion?: string;
  processes: GpuProcess[];
}

export interface GpuSnapshot {
  timestamp: number;
  utilization: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  temperature?: number;
  powerDraw?: number;
}

export interface GpuMonitorState {
  gpus: GpuInfo[];
  error?: string;
}
