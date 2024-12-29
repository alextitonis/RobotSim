import { TVector } from "../types";
import {
  GridCell,
  OccupancyGrid,
  Pose,
  NavigationGoal,
  NavigationState,
  NavigationStatus
} from "./types";
import { PathPlanner } from "./PathPlanner";
import { ParticleFilter } from "./ParticleFilter";
import { ISensor, SensorReading } from "../sensors/types";
import { VectorFieldHistogram } from "./VectorFieldHistogram";
import { SensorVisualizer } from "../visualization/SensorVisualizer";
import { Scene } from "@babylonjs/core";
import { MapVisualizer } from "../visualization/MapVisualizer";

export class NavigationSystem {
  private map: OccupancyGrid;
  private currentPose: Pose;
  private navigationState: NavigationState;
  private readonly updateInterval: number = 100; // ms
  private readonly defaultGridResolution: number = 0.05; // 5cm per cell
  private readonly pathPlanner: PathPlanner;
  private particleFilter: ParticleFilter;
  private lastPosition: TVector;
  public sensors: ISensor[] = [];
  private vfh: VectorFieldHistogram;
  private visualizer: SensorVisualizer | null = null;
  private mapVisualizer: MapVisualizer | null = null;
  private readonly GOAL_POSITION_TOLERANCE = 0.1; // 10cm
  private readonly GOAL_ANGLE_TOLERANCE = 0.1; // ~6 degrees

  constructor(
    initialPosition: TVector,
    scene: Scene,
    isSimulation: boolean,
    mapCanvas: HTMLCanvasElement | null = null
  ) {
    // Increase resolution (smaller cell size)
    this.defaultGridResolution = 0.05; // 5cm per cell (was 10cm)

    // Make map slightly larger
    this.map = this.createEmptyMap(30, 30); // 30x30 meters (was 20x20)

    // Initialize pose from robot position
    this.currentPose = {
      x: initialPosition.x,
      y: initialPosition.z,
      theta: 0
    };

    this.navigationState = {
      currentPose: this.currentPose,
      currentMap: this.map,
      isNavigating: false,
      status: "idle"
    };

    this.pathPlanner = new PathPlanner();

    this.particleFilter = new ParticleFilter({
      x: initialPosition.x,
      y: initialPosition.z,
      theta: 0
    });

    this.lastPosition = initialPosition;

    this.vfh = new VectorFieldHistogram();

    if (isSimulation) {
      this.visualizer = new SensorVisualizer(scene);
      this.mapVisualizer = new MapVisualizer(scene, mapCanvas);
    }
  }

  private createEmptyMap(
    widthMeters: number,
    heightMeters: number
  ): OccupancyGrid {
    const width = Math.ceil(widthMeters / this.defaultGridResolution);
    const height = Math.ceil(heightMeters / this.defaultGridResolution);

    const cells: GridCell[][] = Array(height)
      .fill(null)
      .map(() =>
        Array(width)
          .fill(null)
          .map(() => ({
            occupied: false,
            probability: 0.5, // Unknown state
            cost: 0,
            lastUpdated: Date.now()
          }))
      );

    return {
      cells,
      resolution: this.defaultGridResolution,
      width,
      height,
      origin: { x: -widthMeters / 2, y: -heightMeters / 2 }
    };
  }

  // Convert world coordinates to grid coordinates
  private worldToGrid(x: number, y: number): { row: number; col: number } {
    // Make sure we're using consistent coordinates
    const col = Math.floor((x - this.map.origin.x) / this.map.resolution);
    const row = Math.floor((y - this.map.origin.y) / this.map.resolution);
    return { row, col };
  }

  // Convert grid coordinates to world coordinates
  private gridToWorld(row: number, col: number): { x: number; y: number } {
    const x = col * this.map.resolution + this.map.origin.x;
    const y = row * this.map.resolution + this.map.origin.y;
    return { x, y };
  }

  // Update map with new sensor data
  updateMap(sensorData: SensorReading[]): void {
    let significantChange = false;
    const significantThreshold = 0.3; // Probability change threshold

    console.log("Updating map with readings:", {
      total: sensorData.length,
      occupied: sensorData.filter(r => r.occupied).length,
      currentPose: this.currentPose
    });

    // Process each sensor reading
    sensorData.forEach(reading => {
      if (!reading.occupied) return;

      // Get robot position in grid coordinates
      const robotGrid = this.worldToGrid(
        this.currentPose.x,
        this.currentPose.y
      );
      const hitGrid = this.worldToGrid(reading.point.x, reading.point.y);

      // Skip if hit point is out of bounds
      if (
        hitGrid.row < 0 ||
        hitGrid.row >= this.map.height ||
        hitGrid.col < 0 ||
        hitGrid.col >= this.map.width
      ) {
        return;
      }

      // Mark cells along the ray as free
      const points = this.bresenham(
        robotGrid.row,
        robotGrid.col,
        hitGrid.row,
        hitGrid.col
      );

      // Update cells along ray
      points.forEach((point, index) => {
        if (
          point.row >= 0 &&
          point.row < this.map.height &&
          point.col >= 0 &&
          point.col < this.map.width
        ) {
          const cell = this.map.cells[point.row][point.col];
          const oldOccupied = cell.occupied;
          const oldProbability = cell.probability;

          if (index === points.length - 1) {
            // Hit point - mark as occupied
            cell.probability = 0.95;
            cell.occupied = true;
          } else {
            // Free space along ray
            cell.probability = 0.1;
            cell.occupied = false;
          }

          // Check if this update represents a significant change
          if (
            Math.abs(oldProbability - cell.probability) > significantThreshold
          ) {
            significantChange = true;
          }

          cell.lastUpdated = Date.now();
        }
      });
    });

    // Replan if:
    // 1. Map changed significantly
    // 2. Currently navigating
    // 3. Have a valid goal
    // 4. Current path is blocked or inefficient
    if (
      significantChange &&
      this.navigationState.isNavigating &&
      this.navigationState.currentGoal
    ) {
      const currentPathValid = this.checkPathValidity(
        this.navigationState.path ?? []
      );

      if (!currentPathValid) {
        console.log("Path blocked, replanning...");
        const newPath = this.pathPlanner.planPath(
          this.currentPose,
          this.navigationState.currentGoal.pose,
          this.map
        );

        if (newPath.length > 0) {
          console.log("Found new path");
          this.navigationState.path = newPath;
        } else {
          console.warn("No alternative path found");
          this.navigationState.isNavigating = false;
          this.navigationState.path = undefined;
        }
      }
    }

    // Update visualization
    if (this.mapVisualizer) {
      this.mapVisualizer.updateMap(
        this.map,
        this.currentPose,
        this.navigationState.path || []
      );
    }
  }

  // Bresenham's line algorithm for ray tracing
  private bresenham(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): { row: number; col: number }[] {
    const points: { row: number; col: number }[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    while (true) {
      points.push({ row: x, col: y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return points;
  }

  // Update robot's pose
  async updatePose(position: TVector, rotation: TVector): Promise<void> {
    // Calculate motion since last update
    const deltaPosition = {
      x: position.x - this.lastPosition.x,
      y: position.y - this.lastPosition.y,
      z: position.z - this.lastPosition.z
    };

    const deltaRotation = rotation.y - this.currentPose.theta;

    // Update particle filter prediction
    this.particleFilter.predict(deltaPosition, deltaRotation);

    // If we have sensor measurements, update the filter
    const sensorData = await this.getSensorMeasurements();
    if (sensorData.length > 0) {
      this.particleFilter.update(sensorData);
    }

    // Get estimated pose from particle filter
    const estimatedPose = this.particleFilter.getEstimatedPose();
    this.currentPose = estimatedPose;
    this.navigationState.currentPose = estimatedPose;

    // Store current position for next update
    this.lastPosition = position;

    // Update visualizations
    if (this.visualizer) {
      this.visualizer.updateSensorReadings(sensorData);
      this.visualizer.updateParticles(this.particleFilter.getParticlePoses());
      if (this.navigationState.path) {
        this.visualizer.updatePlannedPath(this.navigationState.path);
      }
    }

    // Check if we've reached the goal
    if (
      this.navigationState.isNavigating &&
      this.navigationState.currentGoal &&
      this.isGoalReached(this.currentPose, this.navigationState.currentGoal)
    ) {
      console.log("Goal reached!");
      this.navigationState.isNavigating = false;
      this.navigationState.path = undefined;
    }
  }

  // Get current navigation state
  getNavigationState(): NavigationState {
    return this.navigationState;
  }

  // Set new navigation goal
  setGoal(goal: NavigationGoal): void {
    this.updateNavigationStatus("planning");
    this.navigationState.currentGoal = goal;
    this.navigationState.isNavigating = true;

    // Plan path to goal
    const path = this.pathPlanner.planPath(
      this.currentPose,
      goal.pose,
      this.map
    );

    console.log("Path:", path);
    if (path.length === 0) {
      this.updateNavigationStatus("failed", "No path found to goal");
      return;
    }

    this.navigationState.path = path;

    // Update visualizations after path is set
    if (this.mapVisualizer) {
      this.mapVisualizer.updateMap(this.map, this.currentPose, path);
    }
  }

  // Get next velocity command based on current state
  async getVelocityCommand(): Promise<{ linear: number; angular: number }> {
    if (
      !this.navigationState.isNavigating ||
      !this.navigationState.path?.length
    ) {
      return { linear: 0, angular: 0 };
    }

    // Get current sensor data for obstacle avoidance
    const sensorData = await this.getSensorMeasurements();

    // Emergency stop if too close to obstacles
    const minDistance = Math.min(...sensorData.map(s => s.distance));
    if (minDistance < 0.3) {
      // 30cm safety margin
      console.warn("Emergency stop - obstacle too close");
      return { linear: 0, angular: 0 };
    }

    // Get next waypoint
    const target = this.navigationState.path[0];

    // Calculate basic parameters
    const dx = target.x - this.currentPose.x;
    const dy = target.y - this.currentPose.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const targetAngle = Math.atan2(dy, dx);

    // Use VFH to find safe direction
    const safeAngle = this.vfh.findBestDirection(sensorData, targetAngle, {
      x: dx,
      y: 0,
      z: dy
    });

    // If waypoint reached, remove it from path
    if (distance < 0.3) {
      // 30cm waypoint reach threshold
      this.navigationState.path.shift();
      if (this.navigationState.path.length === 0) {
        return { linear: 0, angular: 0 };
      }
    }

    // Calculate angle difference using safe direction
    const angleDiff = this.normalizeAngle(safeAngle - this.currentPose.theta);

    // Adjust velocity based on:
    // - Obstacle proximity
    // - Angle to target
    // - Distance to target
    const speedFactor = Math.min(1.0, Math.max(0.1, (minDistance - 0.3) / 1.0));
    const angularSpeed = angleDiff * 2.0; // Proportional turning

    // Reduce speed when turning sharply
    const turnFactor = Math.cos(angleDiff);
    const linearSpeed =
      Math.min(
        distance * 0.5, // Proportional to distance
        0.5 // Max speed 0.5 m/s
      ) *
      speedFactor *
      turnFactor;

    return {
      linear: Math.max(0, linearSpeed), // No reverse
      angular: Math.min(Math.max(angularSpeed, -1.0), 1.0) // Limit rotation
    };
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // Add method to get sensor measurements (to be implemented based on your sensor system)
  private async getSensorMeasurements(): Promise<SensorReading[]> {
    const measurements: SensorReading[] = [];

    for (const sensor of this.sensors) {
      const readings = await sensor.update(
        { x: this.currentPose.x, y: 0, z: this.currentPose.y },
        { x: 0, y: this.currentPose.theta, z: 0 }
      );

      readings.forEach(reading => {
        if (reading.occupied) {
          measurements.push(reading);
        }
      });
    }

    return measurements;
  }

  // Add method to get particle poses for visualization
  getParticlePoses(): Pose[] {
    return this.particleFilter.getParticlePoses();
  }

  addSensor(sensor: ISensor): void {
    this.sensors.push(sensor);
  }

  dispose() {
    if (this.visualizer) {
      this.visualizer.dispose();
    }
    if (this.mapVisualizer) {
      this.mapVisualizer.dispose();
    }
  }

  // Add method to check if goal is reached
  private isGoalReached(currentPose: Pose, goal: NavigationGoal): boolean {
    const distanceToGoal = Math.sqrt(
      Math.pow(currentPose.x - goal.pose.x, 2) +
        Math.pow(currentPose.y - goal.pose.y, 2)
    );

    const angleDifference = Math.abs(
      this.normalizeAngle(currentPose.theta - goal.pose.theta)
    );

    return (
      distanceToGoal <
        (goal.tolerance?.position ?? this.GOAL_POSITION_TOLERANCE) &&
      angleDifference <
        (goal.tolerance?.orientation ?? this.GOAL_ANGLE_TOLERANCE)
    );
  }

  // Add method to check if current path is still valid
  private checkPathValidity(path: Pose[]): boolean {
    if (path.length < 2) return false;

    // Check each segment of the path
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];

      // Sample points along the segment
      const steps = Math.ceil(
        this.distanceBetween(start, end) / (this.map.resolution * 2)
      );

      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const point = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t
        };

        const gridPos = this.worldToGrid(point.x, point.y);

        // Check if point is in collision
        if (
          gridPos.row >= 0 &&
          gridPos.row < this.map.height &&
          gridPos.col >= 0 &&
          gridPos.col < this.map.width
        ) {
          const cell = this.map.cells[gridPos.row][gridPos.col];
          if (cell.occupied || cell.probability > 0.5) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private distanceBetween(a: Pose, b: Pose): number {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  private updateNavigationStatus(
    status: NavigationStatus,
    error?: string
  ): void {
    this.navigationState.status = status;
    this.navigationState.lastError = error;

    console.log(`Navigation Status: ${status}${error ? ` - ${error}` : ""}`);
  }
}
