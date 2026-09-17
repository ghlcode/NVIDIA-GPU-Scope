import { GpuInfo } from "../core/types";

export interface GpuProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getGpus(): Promise<GpuInfo[]>;
}
