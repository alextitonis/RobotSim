import { Scene, Vector3, Ray, RayHelper, Color3 } from "@babylonjs/core";
import { SensorParams, SensorReading } from "../types";
import { IRobotSensorPlugin, TVector } from "../../types";

export interface LidarConfig {
  numberOfRays: number;
  maxRange: number;
  angleSpread: number;
  visualize?: boolean;
  rayHeight?: number;
  verticalRays?: number;
}

export class LidarSensor implements IRobotSensorPlugin {
  private scene: Scene | null = null;
  private rays: Ray[] = [];
  private rayHelpers: RayHelper[] = [];
  private readonly config: LidarConfig;

  constructor(config: LidarConfig) {
    this.config = {
      numberOfRays: config.numberOfRays || 32,
      maxRange: config.maxRange || 10,
      angleSpread: config.angleSpread || Math.PI,
      visualize: config.visualize || false,
      rayHeight: config.rayHeight || 0.5,
      verticalRays: config.verticalRays || 1
    };
  }

  initialize({ scene }: SensorParams): void {
    this.scene = scene;
    // Enable collision detection for the scene
    scene.collisionsEnabled = true;
    this.createRays();
  }

  private createRays(): void {
    if (!this.scene) return;

    // Clear existing rays
    this.rayHelpers.forEach(helper => helper.dispose());
    this.rays = [];
    this.rayHelpers = [];

    const angleStep = this.config.angleSpread / (this.config.numberOfRays - 1);
    const startAngle = -this.config.angleSpread / 2;
    const verticalStep = 0.5 / Math.max(1, (this.config.verticalRays ?? 1) - 1);
    // Create rays in a vertical spread pattern
    for (let v = 0; v < (this.config.verticalRays ?? 1); v++) {
      const height = (this.config.rayHeight ?? 0.5) - v * verticalStep;

      for (let i = 0; i < this.config.numberOfRays; i++) {
        const angle = startAngle + i * angleStep;
        const direction = new Vector3(
          Math.cos(angle),
          0,
          Math.sin(angle)
        ).normalize();

        const ray = new Ray(
          new Vector3(0, height, 0),
          direction,
          this.config.maxRange
        );
        this.rays.push(ray);

        if (this.config.visualize) {
          const rayHelper = new RayHelper(ray);
          rayHelper.show(this.scene, Color3.Red());
          this.rayHelpers.push(rayHelper);
        }
      }
    }
  }

  async update(
    robotPosition: TVector,
    robotRotation: TVector
  ): Promise<SensorReading[]> {
    if (!this.scene) return [];

    const readings: SensorReading[] = [];
    const origin = new Vector3(
      robotPosition.x,
      robotPosition.y + (this.config.rayHeight ?? 0.5),
      robotPosition.z
    );

    for (let rayIndex = 0; rayIndex < this.rays.length; rayIndex++) {
      const ray = this.rays[rayIndex];
      ray.origin = origin;

      // Calculate world-space angle including robot's rotation
      const horizontalIndex = rayIndex % this.config.numberOfRays;
      const baseAngle =
        -this.config.angleSpread / 2 +
        (horizontalIndex * this.config.angleSpread) /
          (this.config.numberOfRays - 1);
      const worldAngle = baseAngle + robotRotation.y;

      // Update ray direction in world space
      const direction = new Vector3(
        Math.cos(worldAngle),
        0,
        Math.sin(worldAngle)
      ).normalize();
      ray.direction = direction;

      // More precise collision detection
      const hit = this.scene.pickWithRay(
        ray,
        mesh => {
          return (
            mesh.isPickable &&
            mesh.isEnabled() &&
            mesh.checkCollisions && // Add collision check
            (mesh.name.startsWith("obstacle") ||
              mesh.name.startsWith("wall") ||
              mesh.name.includes("collision"))
          );
        },
        false
      ); // false for more accurate but slower picking

      if (hit?.hit && hit.pickedPoint && hit.distance <= this.config.maxRange) {
        // Convert world coordinates to match the occupancy grid's coordinate system
        readings.push({
          point: {
            x: hit.pickedPoint.x,
            y: hit.pickedPoint.z, // Use z for ground plane coordinate
            z: hit.pickedPoint.y
          },
          distance: hit.distance,
          occupied: true,
          meshId: hit.pickedMesh?.name || "unknown",
          normal: hit.getNormal()?.asArray() || undefined
        });

        if (this.config.visualize && rayIndex < this.rayHelpers.length) {
          const helper = this.rayHelpers[rayIndex];
          helper.show(this.scene, new Color3(1, 0, 0));
          ray.length = hit.distance;
        }
      } else if (this.config.visualize && rayIndex < this.rayHelpers.length) {
        const helper = this.rayHelpers[rayIndex];
        helper.show(this.scene, new Color3(0, 0, 1));
        ray.length = this.config.maxRange;
      }
    }

    return readings;
  }
}
