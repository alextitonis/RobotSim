/* eslint-disable @typescript-eslint/no-explicit-any */
// Add new visualizer for occupancy grid
// Show explored vs unexplored areas
// Visualize path planning process

import {
  Scene,
  DynamicTexture,
  StandardMaterial,
  MeshBuilder,
  Color3,
  Mesh,
  ICanvasRenderingContext
} from "@babylonjs/core";
import { OccupancyGrid, Pose } from "../navigation/types";

export class MapVisualizer {
  private scene: Scene;
  private mapMesh: Mesh | null = null;
  private texture: DynamicTexture | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;

  constructor(scene: Scene, mapCanvas: HTMLCanvasElement | null) {
    this.scene = scene;
    this.mapCanvas = mapCanvas;
  }

  updateMap(map: OccupancyGrid, robotPose: Pose, path: Pose[] = []) {
    console.log("Updating map with:", {
      robotPose,
      path,
      mapOrigin: map.origin,
      mapResolution: map.resolution,
      mapSize: { width: map.width, height: map.height }
    });

    // Create or update texture with larger size
    if (!this.texture) {
      this.texture = new DynamicTexture(
        "mapTexture",
        { width: 512, height: 512 }, // Increased resolution
        this.scene,
        false
      );
    }

    const context = this.texture.getContext();
    context.clearRect(0, 0, 512, 512); // Clear previous frame

    // Draw occupancy grid with stronger colors
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const cell = map.cells[y][x];
        if (cell.occupied) {
          context.fillStyle = "rgba(255, 0, 0, 0.8)";
        } else if (cell.probability < 0.3) {
          context.fillStyle = "rgba(0, 255, 0, 0.5)";
        } else {
          context.fillStyle = "rgba(128, 128, 128, 0.3)";
        }

        // Scale grid cells to texture size
        const cellWidth = 512 / map.width;
        const cellHeight = 512 / map.height;
        const pixelX = x * cellWidth;
        const pixelY = 512 - (y + 1) * cellHeight;

        context.fillRect(pixelX, pixelY, cellWidth + 1, cellHeight + 1);
      }
    }

    // Draw path
    if (path.length > 0) {
      // Draw path shadow
      context.strokeStyle = "rgba(0, 0, 0, 0.5)";
      context.lineWidth = 6;
      this.drawPath(context, path, map);

      // Draw main path
      context.strokeStyle = "rgba(0, 128, 255, 0.9)";
      context.lineWidth = 4;
      this.drawPath(context, path, map);

      // Draw waypoints
      path.forEach((pose, index) => {
        const point = this.worldToPixel(pose, map);
        context.beginPath();
        if (index === 0) {
          context.fillStyle = "rgba(0, 255, 0, 0.8)"; // Start
        } else if (index === path.length - 1) {
          context.fillStyle = "rgba(255, 0, 0, 0.8)"; // Goal
        } else {
          context.fillStyle = "rgba(0, 128, 255, 0.8)"; // Waypoint
        }
        context.arc(point.x, 512 - point.y, 6, 0, Math.PI * 2);
        context.fill();
      });
    }

    // Draw robot position larger
    const robotPixel = this.worldToPixel(robotPose, map);
    context.fillStyle = "rgba(255, 255, 0, 0.8)"; // Yellow for robot
    context.beginPath();
    context.arc(robotPixel.x, 512 - robotPixel.y, 8, 0, Math.PI * 2);
    context.fill();

    // Draw robot direction
    context.strokeStyle = "yellow";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(robotPixel.x, 512 - robotPixel.y);
    context.lineTo(
      robotPixel.x + Math.cos(robotPose.theta) * 16,
      512 - (robotPixel.y + Math.sin(robotPose.theta) * 16)
    );
    context.stroke();

    this.texture.update();

    // Also draw to MapVision canvas if available
    if (this.mapCanvas) {
      const ctx = this.mapCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        this.drawMapContent(ctx, map, robotPose, path);
      }
    }

    // Create or update ground mesh with larger size
    if (!this.mapMesh) {
      this.mapMesh = MeshBuilder.CreateGround(
        "mapMesh",
        {
          width: map.width * map.resolution * 1.5, // Made larger
          height: map.height * map.resolution * 1.5
        },
        this.scene
      );

      const material = new StandardMaterial("mapMaterial", this.scene);
      material.diffuseTexture = this.texture;
      material.emissiveColor = Color3.White();
      material.alpha = 0.8; // Semi-transparent
      this.mapMesh.material = material;

      this.mapMesh.position.x = map.origin.x + (map.width * map.resolution) / 2;
      this.mapMesh.position.z =
        map.origin.y + (map.height * map.resolution) / 2;
      this.mapMesh.position.y = 0.02; // Slightly higher above ground
    }
  }

  private worldToPixel(
    pose: Pose,
    map: OccupancyGrid
  ): { x: number; y: number } {
    // Transform from world coordinates to map coordinates
    const mapX = (pose.x - map.origin.x) / map.resolution;
    const mapY = (pose.y - map.origin.y) / map.resolution;

    // Scale to canvas size (512x512)
    return {
      x: (mapX * 512) / map.width,
      y: (mapY * 512) / map.height
    };
  }

  private drawPath(context: any, path: Pose[], map: OccupancyGrid) {
    context.beginPath();
    const firstPoint = this.worldToPixel(path[0], map);
    context.moveTo(firstPoint.x, 512 - firstPoint.y);

    for (let i = 1; i < path.length; i++) {
      const point = this.worldToPixel(path[i], map);
      context.lineTo(point.x, 512 - point.y);
    }
    context.stroke();
  }

  private drawMapContent(
    context: ICanvasRenderingContext | CanvasRenderingContext2D,
    map: OccupancyGrid,
    robotPose: Pose,
    path: Pose[]
  ) {
    // Clear canvas
    context.clearRect(0, 0, 512, 512);

    // Draw occupancy grid
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const cell = map.cells[y][x];
        if (cell.occupied) {
          context.fillStyle = "rgba(255, 0, 0, 0.8)"; // Red for obstacles
        } else if (cell.probability < 0.3) {
          context.fillStyle = "rgba(0, 255, 0, 0.5)"; // Green for free space
        } else {
          context.fillStyle = "rgba(128, 128, 128, 0.3)"; // Gray for unknown
        }

        const cellWidth = 512 / map.width;
        const cellHeight = 512 / map.height;
        const pixelX = x * cellWidth;
        const pixelY = 512 - (y + 1) * cellHeight;

        context.fillRect(pixelX, pixelY, cellWidth + 1, cellHeight + 1);
      }
    }

    // Draw path
    if (path.length > 0) {
      // Draw path shadow
      context.strokeStyle = "rgba(0, 0, 0, 0.5)";
      context.lineWidth = 6;
      this.drawPath(context, path, map);

      // Draw main path
      context.strokeStyle = "rgba(0, 128, 255, 0.9)";
      context.lineWidth = 4;
      this.drawPath(context, path, map);

      // Draw waypoints
      path.forEach((pose, index) => {
        const point = this.worldToPixel(pose, map);
        context.beginPath();
        if (index === 0) {
          context.fillStyle = "rgba(0, 255, 0, 0.8)"; // Start
        } else if (index === path.length - 1) {
          context.fillStyle = "rgba(255, 0, 0, 0.8)"; // Goal
        } else {
          context.fillStyle = "rgba(0, 128, 255, 0.8)"; // Waypoint
        }
        context.arc(point.x, 512 - point.y, 6, 0, Math.PI * 2);
        context.fill();
      });
    }

    // Draw robot
    const robotPixel = this.worldToPixel(robotPose, map);
    context.fillStyle = "rgba(255, 255, 0, 0.8)";
    context.beginPath();
    context.arc(robotPixel.x, 512 - robotPixel.y, 8, 0, Math.PI * 2);
    context.fill();

    // Draw robot direction
    context.strokeStyle = "yellow";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(robotPixel.x, 512 - robotPixel.y);
    context.lineTo(
      robotPixel.x + Math.cos(robotPose.theta) * 16,
      512 - (robotPixel.y + Math.sin(robotPose.theta) * 16)
    );
    context.stroke();
  }

  dispose() {
    if (this.mapMesh) {
      this.mapMesh.dispose();
    }
    if (this.texture) {
      this.texture.dispose();
    }
  }
}
