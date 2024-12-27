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

export class Robot {
  position: TVector;
  rotation: TVector;
  velocity: TVector;
  config: RobotConfig;
  physics?: RobotPhysics;
  camera?: IRobotCamera;
  headRotation: TVector;
  llm?: IRobotLLM;
  constructor(
    position: TVector,
    rotation: TVector,
    velocity: TVector,
    config: RobotConfig,
    cameraPlugin?: IRobotCamera,
    llmPlugin?: IRobotLLM
  ) {
    this.position = position;
    this.rotation = rotation;
    this.velocity = velocity;
    this.config = config;
    this.headRotation = { x: 0, y: 0, z: 0 };

    if (config.type === "simulation") {
      this.physics = new RobotPhysics(position, velocity, config);
      if (cameraPlugin) {
        this.camera = cameraPlugin;
      } else {
        this.camera = new FirstPersonCamera();
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
  }

  getState(): RobotState {
    return {
      position: this.position,
      rotation: this.rotation,
      velocity: this.velocity
    };
  }

  updateFromPhysics() {
    if (!this.physics) return;

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
}
