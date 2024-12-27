/* eslint-disable @typescript-eslint/no-empty-object-type */
import { Camera } from "@babylonjs/core";
import { ChatCompletionChunk } from "openai/resources/index.mjs";
import { Stream } from "openai/streaming.mjs";

export type TVector = {
  x: number;
  y: number;
  z: number;
};

export interface RobotState {
  position: TVector;
  rotation: TVector;
  velocity: TVector;
}

export interface RobotConfig {
  dimensions: TVector;
  mass: number;
  maxSpeed: number;
  maxRotationSpeed: number;
  llmType: "chatgpt";
  type: "simulation";
}

export interface IRobotCameraParams {}

export interface IRobotCamera {
  initialize(params: IRobotCameraParams): Camera;
  update(position: TVector, rotation: TVector): void;
  getCamera(): Camera | null;
  capturePhoto(): Promise<Blob>;
  rotateCamera(yaw: number, pitch: number): void;
}

export interface IRobotLLMParams {
  apiKey: string;
}

export interface IRobotLLM {
  initialize(params: IRobotLLMParams): void;
  complete(prompt: string): Promise<string>;
  stream(prompt: string): Promise<Stream<ChatCompletionChunk>>;
}
