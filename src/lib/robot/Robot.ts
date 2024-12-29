import {
  TVector,
  RobotState,
  RobotConfig,
  IRobotCamera,
  IRobotLLM
} from "./types";
import { RobotPhysics } from "./simulation/RobotPhysics";
import { Camera } from "@babylonjs/core";
import { FirstPersonCamera } from "./simulation/FirstPersonCamera";
import { ChatGPT } from "./llm/chatgpt";
import { NavigationSystem } from "./navigation/NavigationSystem";
import { LidarSensor } from "./sensors/LidarSensor";
import { DepthCameraSensor } from "./sensors/DepthCameraSensor";
import { Scene } from "@babylonjs/core";
import { SensorReading } from "./sensors/types";
import { NavigationGoal } from "./navigation/types";

export class Robot {
  position: TVector;
  rotation: TVector;
  velocity: TVector;
  config: RobotConfig;
  physics?: RobotPhysics;
  camera?: IRobotCamera;
  headRotation: TVector;
  llm?: IRobotLLM;
  private navigationSystem: NavigationSystem;

  constructor(
    position: TVector,
    rotation: TVector,
    velocity: TVector,
    config: RobotConfig,
    scene: Scene,
    cameraPlugin?: IRobotCamera,
    llmPlugin?: IRobotLLM,
    mapCanvas?: HTMLCanvasElement
  ) {
    this.position = position;
    this.rotation = rotation;
    this.velocity = velocity;
    this.config = config;
    this.headRotation = { x: 0, y: 0, z: 0 };

    this.navigationSystem = new NavigationSystem(
      position,
      scene,
      config.type === "simulation",
      mapCanvas
    );

    if (config.type === "simulation") {
      this.physics = new RobotPhysics(position, velocity, config);
      if (cameraPlugin) {
        this.camera = cameraPlugin;
      } else {
        this.camera = new FirstPersonCamera();
      }

      // Initialize sensors with scene
      console.log("dada scene sensor:", scene);
      const lidar = new LidarSensor({
        numberOfRays: 32,
        maxRange: 10,
        angleSpread: Math.PI * 1.5,
        visualize: config.type === "simulation"
      });
      lidar.initialize({ scene });

      const depthCamera = new DepthCameraSensor({
        width: 320,
        height: 240,
        fov: 1.2,
        maxRange: 10,
        samplingStride: 16
      });
      depthCamera.initialize({ scene });

      // Add sensors to navigation system
      this.navigationSystem.addSensor(lidar);
      this.navigationSystem.addSensor(depthCamera);

      // Set camera for depth sensor
      if (this.camera) {
        depthCamera.setCamera(this.camera.getCamera()!);
      }
    }

    if (llmPlugin) {
      this.llm = llmPlugin;
    } else {
      if (config.llmType === "chatgpt") {
        this.llm = new ChatGPT();
        (this.llm as ChatGPT).initialize({
          model: "gpt-4o-mini",
          apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY ?? ""
        });
      }
    }
    this.updateNavigation();
  }

  getState(): RobotState {
    return {
      position: this.position,
      rotation: this.rotation,
      velocity: this.velocity
    };
  }

  async updateFromPhysics() {
    if (!this.physics) return;

    await this.updateNavigation();

    // Get velocity commands from navigation system
    const command = await this.navigationSystem.getVelocityCommand();

    // Apply velocity commands to physics
    if (this.physics) {
      const speed = command.linear;
      const turn = command.angular;

      // Convert to local velocities
      const vx = speed * Math.cos(this.rotation.y);
      const vz = speed * Math.sin(this.rotation.y);

      this.physics.body.velocity.x = vx;
      this.physics.body.velocity.z = vz;
      this.physics.body.angularVelocity.y = turn;
    }

    // Update position and rotation from physics
    this.position = {
      x: this.physics.body.position.x,
      y: this.physics.body.position.y,
      z: this.physics.body.position.z
    };

    this.rotation = {
      x: this.physics.body.quaternion.x,
      y: this.physics.body.quaternion.y,
      z: this.physics.body.quaternion.z
    };

    this.velocity = {
      x: this.physics.body.velocity.x,
      y: this.physics.body.velocity.y,
      z: this.physics.body.velocity.z
    };
  }

  // Add new method to update camera
  updateCamera() {
    if (this.camera) {
      this.camera.update(this.position, this.rotation);
    }
  }

  // Add method to get camera instance
  getCamera(): Camera | null {
    return this.camera?.getCamera() || null;
  }

  rotateHead(yaw: number, pitch: number) {
    // Limit yaw to approximately human range (±80 degrees)
    const maxYaw = (Math.PI * 80) / 180; // 80 degrees in radians
    const maxPitch = Math.PI / 3; // 60 degrees for up/down

    // Calculate new rotation values
    const newYaw = this.headRotation.y + yaw;
    const newPitch = this.headRotation.x + pitch;

    // Clamp yaw to ±80 degrees
    this.headRotation.y = Math.max(-maxYaw, Math.min(maxYaw, newYaw));

    // Clamp pitch to ±60 degrees
    this.headRotation.x = Math.max(-maxPitch, Math.min(maxPitch, newPitch));

    // Update camera if it exists
    if (this.camera) {
      const combinedRotation = {
        x: this.rotation.x + this.headRotation.x,
        y: this.rotation.y + this.headRotation.y,
        z: this.rotation.z
      };
      this.camera.update(this.position, combinedRotation);
    }
  }

  async updateNavigation() {
    this.navigationSystem.updatePose(this.position, this.rotation);

    // Get current sensor data
    const sensorData: SensorReading[] = [];

    // Wait for all sensor updates
    console.log("Getting sensor readings...");
    const readings = await Promise.all(
      this.navigationSystem.sensors.map(async sensor => {
        const reading = await sensor.update(this.position, this.rotation);
        console.log("Sensor reading:", {
          type: sensor.constructor.name,
          count: reading.length,
          occupied: reading.filter(r => r.occupied).length
        });
        return reading;
      })
    );

    // Combine all readings
    readings.forEach(reading => sensorData.push(...reading));
    console.log("Total sensor readings:", sensorData.length);

    // Update map with sensor data
    this.navigationSystem.updateMap(sensorData);
  }

  getNavigationState() {
    return this.navigationSystem.getNavigationState();
  }

  setNavigationGoal(goal: NavigationGoal): void {
    this.navigationSystem.setGoal(goal);
  }
}
