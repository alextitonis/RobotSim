import { Scene } from "@babylonjs/core";
import { TVector } from "../types";

export interface SensorReading {
  point: TVector;
  distance: number;
  occupied: boolean;
  meshId: string;
  normal?: number[];
}

export interface SensorParams {
  scene: Scene;
}
