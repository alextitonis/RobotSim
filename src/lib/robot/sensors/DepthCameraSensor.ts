import { Scene, Camera, RenderTargetTexture } from "@babylonjs/core";
import { ISensor, SensorParams, SensorReading } from "./types";
import { TVector } from "../types";

export interface DepthCameraConfig {
  width: number;
  height: number;
  fov: number;
  maxRange: number;
  samplingStride: number;
}

export class DepthCameraSensor implements ISensor {
  private scene: Scene | null = null;
  private camera: Camera | null = null;
  private renderTarget: RenderTargetTexture | null = null;
  private readonly config: DepthCameraConfig;

  constructor(config: DepthCameraConfig) {
    this.config = {
      width: config.width || 320,
      height: config.height || 240,
      fov: config.fov || 1.0472, // 60 degrees
      maxRange: config.maxRange || 10,
      samplingStride: config.samplingStride || 16 // Sample every 16 pixels
    };
  }

  initialize({ scene }: SensorParams): void {
    this.scene = scene;

    // Create render target for depth
    this.renderTarget = new RenderTargetTexture(
      "depthSensor",
      {
        width: this.config.width,
        height: this.config.height
      },
      scene,
      false,
      true
    );

    scene.customRenderTargets.push(this.renderTarget);
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  async update(
    robotPosition: TVector,
    robotRotation: TVector
  ): Promise<SensorReading[]> {
    if (!this.scene || !this.camera || !this.renderTarget) return [];

    const readings: SensorReading[] = [];

    // Update render target
    this.renderTarget.activeCamera = this.camera;
    this.renderTarget.renderList = this.scene.meshes;
    this.renderTarget.render();

    // Read depth buffer
    const depthData = await this.renderTarget.readPixels();
    if (!depthData) return [];

    // Cast to Uint8Array
    const depthArray = new Uint8Array(depthData.buffer);

    // Sample depth data
    if (this.config.samplingStride) {
      for (let y = 0; y < this.config.height; y += this.config.samplingStride) {
        for (
          let x = 0;
          x < this.config.width;
          x += this.config.samplingStride
        ) {
          const idx = (y * this.config.width + x) * 4;

          // Convert RGBA to depth
          const depth = (depthArray[idx] / 255.0) * this.config.maxRange;

          if (depth < this.config.maxRange) {
            // Convert screen coordinates to world coordinates
            // This is a simplified conversion - you might want to improve this
            const fovX =
              this.config.fov * (this.config.width / this.config.height);
            const angleX = (x / this.config.width - 0.5) * fovX;
            const angleY = (y / this.config.height - 0.5) * this.config.fov;

            const point = {
              x: robotPosition.x + Math.cos(robotRotation.y + angleX) * depth,
              y: robotPosition.y + Math.sin(angleY) * depth,
              z: robotPosition.z + Math.sin(robotRotation.y + angleX) * depth
            };

            readings.push({
              point,
              distance: depth,
              occupied: true,
              meshId: "unknown"
            });
          }
        }
      }
    }

    return readings;
  }
}
