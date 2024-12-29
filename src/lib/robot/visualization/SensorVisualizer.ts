import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  LinesMesh,
  PointsCloudSystem,
  Mesh
} from "@babylonjs/core";
import { SensorReading } from "../sensors/types";
import { Pose } from "../navigation/types";

export class SensorVisualizer {
  private scene: Scene;
  private pointCloud: PointsCloudSystem | null = null;
  private pathLines: LinesMesh | null = null;
  private particles: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    // Enable depth writer for rendering groups
    scene.setRenderingAutoClearDepthStencil(1, false);
    this.initializePointCloud();
  }

  private initializePointCloud() {
    this.pointCloud = new PointsCloudSystem("sensorPoints", 1, this.scene);
    this.pointCloud.addPoints(0);
    this.pointCloud.buildMeshAsync().then(mesh => {
      if (mesh) {
        mesh.renderingGroupId = 1;
      }
    });
  }

  updateSensorReadings(readings: SensorReading[]) {
    if (!this.pointCloud) return;

    // Update point cloud with sensor readings
    this.pointCloud.dispose();
    this.pointCloud = new PointsCloudSystem("sensorPoints", 1, this.scene);

    readings.forEach(reading => {
      this.pointCloud!.addPoints(
        1,
        (point: { position: Vector3; color: Color3 }) => {
          point.position = new Vector3(
            reading.point.x,
            reading.point.y,
            reading.point.z
          );
          point.color = reading.occupied ? Color3.Red() : Color3.Green();
        }
      );
    });

    this.pointCloud.buildMeshAsync();
  }

  updatePlannedPath(path: Pose[]) {
    // Remove old path visualization
    if (this.pathLines) {
      this.pathLines.dispose();
    }

    // Create path lines with better visibility
    const points = path.map(pose => new Vector3(pose.x, 0.1, pose.y));

    if (points.length > 1) {
      // Create main path line
      this.pathLines = MeshBuilder.CreateLines(
        "plannedPath",
        { points, updatable: true },
        this.scene
      );

      // Make path more visible
      const pathMaterial = new StandardMaterial("pathMaterial", this.scene);
      pathMaterial.emissiveColor = new Color3(0, 0.5, 1); // Bright blue
      pathMaterial.alpha = 0.8;
      pathMaterial.disableLighting = true;
      this.pathLines.material = pathMaterial;
      this.pathLines.renderingGroupId = 1;

      // Add waypoint markers
      path.forEach((pose, index) => {
        if (index === 0 || index === path.length - 1) {
          const marker = MeshBuilder.CreateSphere(
            `waypoint-${index}`,
            { diameter: 0.3 },
            this.scene
          );
          marker.position = new Vector3(pose.x, 0.15, pose.y);

          const markerMaterial = new StandardMaterial(
            `waypointMaterial-${index}`,
            this.scene
          );
          markerMaterial.emissiveColor =
            index === 0
              ? new Color3(0, 1, 0) // Green for start
              : new Color3(1, 0, 0); // Red for goal
          markerMaterial.alpha = 0.8;
          marker.material = markerMaterial;

          this.particles.push(marker); // Store for cleanup
        }
      });
    }
  }

  updateParticles(_particles: Pose[]) {
    // Comment out particle visualization if you don't want to see them
    /*
    this.particles.forEach(p => p.dispose());
    this.particles = [];
    particles.forEach(particle => {
      ...
    });
    */
  }

  dispose() {
    if (this.pointCloud) {
      this.pointCloud.dispose();
    }
    if (this.pathLines) {
      this.pathLines.dispose();
    }
    this.particles.forEach(p => p.dispose());
  }
}
