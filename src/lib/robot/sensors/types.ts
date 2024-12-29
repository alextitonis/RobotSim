import { Scene } from "@babylonjs/core";
import { TVector } from "../types";

export interface SensorReading {
  point: TVector;
  distance: number;
  occupied: boolean;
  meshId: string;
  normal?: number[];
}

export interface ISensor {
  initialize(params: SensorParams): void;
  update(
    robotPosition: TVector,
    robotRotation: TVector
  ): Promise<SensorReading[]> | SensorReading[];
}

export interface SensorParams {
  scene: Scene;
}
