import { GpuInfo } from "../core/types";

export interface GpuProviderProbe {
  ok: boolean;
  /** Human readable reason, populated when `ok` is false. */
  message?: string;
}

export interface GpuProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  probe(): Promise<GpuProviderProbe>;
  getGpus(): Promise<GpuInfo[]>;
}
