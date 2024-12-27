import {
  FreeCamera,
  Scene,
  Vector3,
  Tools,
  TransformNode,
  KeyboardEventTypes
} from "@babylonjs/core";
import { TVector, IRobotCamera, IRobotCameraParams } from "../types";

interface IFirstPersonCameraParams extends IRobotCameraParams {
  scene: Scene;
}

export class FirstPersonCamera implements IRobotCamera {
  private camera: FreeCamera | null = null;
  private scene: Scene | null = null;
  private robotMesh: TransformNode | null = null;
  private headBone: TransformNode | null = null;
  private cameraOffset = { x: 0, y: 1.6, z: 0 };
  private rotationSpeed = 0.05;
  private keysPressed = new Set<string>();

  initialize({ scene }: IFirstPersonCameraParams): FreeCamera {
    this.scene = scene;
    this.camera = new FreeCamera(
      "robotFirstPerson",
      new Vector3(0, 0, 0),
      scene
    );
    this.camera.minZ = 0.1;
    this.camera.fov = 1.2;
    this.camera.inertia = 0;

    // Find robot mesh and head bone
    scene.onBeforeRenderObservable.addOnce(() => {
      this.robotMesh = scene.getTransformNodeByName("Wolf3D_Body");
      if (this.robotMesh) {
        const allTransformNodes = scene.transformNodes;
        const headBone = allTransformNodes.find(
          node => node.name === "Wolf3D_Head"
        );
        if (headBone) {
          this.headBone = headBone;
          this.update(new Vector3(0, 0, 0), new Vector3(0, 0, 0));
          console.log("Found ReadyPlayerMe head bone:", headBone.name);
        } else {
          console.warn("ReadyPlayerMe Wolf3D_Head bone not found");
        }
      }
    });

    // Setup keyboard controls
    scene.onKeyboardObservable.add(kbInfo => {
      const key = kbInfo.event.key.toLowerCase();

      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        this.keysPressed.add(key);
      } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        this.keysPressed.delete(key);
      }
    });

    // Add update loop for continuous rotation
    scene.onBeforeRenderObservable.add(() => {
      this.updateRotationFromKeys();
    });

    return this.camera;
  }

  private updateRotationFromKeys() {
    if (!this.camera) return;

    let yaw = 0;
    let pitch = 0;

    // Handle WASD rotation
    if (this.keysPressed.has("a")) yaw += this.rotationSpeed;
    if (this.keysPressed.has("d")) yaw -= this.rotationSpeed;
    if (this.keysPressed.has("w")) pitch -= this.rotationSpeed;
    if (this.keysPressed.has("s")) pitch += this.rotationSpeed;

    if (yaw !== 0 || pitch !== 0) {
      this.rotateCamera(yaw, pitch);
    }
  }

  private normalizeAngle(angle: number): number {
    // Normalize angle to be between -PI and PI
    return ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;
  }

  update(position: TVector, rotation: TVector) {
    if (!this.camera || !this.headBone) return;

    // Get the absolute position of the head bone
    const headWorldPosition = this.headBone.getAbsolutePosition();

    // Update camera position to match head position
    this.camera.position = new Vector3(
      headWorldPosition.x + this.cameraOffset.x,
      headWorldPosition.y + this.cameraOffset.y,
      headWorldPosition.z + this.cameraOffset.z
    );

    // Update camera rotation with normalized angles
    const normalizedRotation = new Vector3(
      this.normalizeAngle(rotation.x),
      this.normalizeAngle(rotation.y),
      0
    );
    this.camera.rotation = normalizedRotation;

    // Update head bone rotation to match camera with constraints
    if (this.headBone) {
      // Clamp pitch rotation (up/down) to prevent unnatural head movements
      const clampedPitch = Math.max(
        Math.min(normalizedRotation.x, Math.PI / 4),
        -Math.PI / 4
      );

      // Clamp yaw rotation (left/right) to 75 degrees (about 1.3 radians) each way
      const clampedYaw = Math.max(
        Math.min(normalizedRotation.y, Math.PI * 0.42),
        -Math.PI * 0.42
      );

      // Apply rotation to head bone in local space
      this.headBone.rotation = new Vector3(clampedPitch, clampedYaw, 0);
    }
  }

  getCamera() {
    return this.camera;
  }

  rotateCamera(yaw: number, pitch: number) {
    if (!this.camera) return;

    // Calculate new rotation with constraints
    const newPitch = Math.max(
      Math.min(this.camera.rotation.x + pitch, Math.PI / 4),
      -Math.PI / 4
    );

    const normalizedYaw = this.normalizeAngle(this.camera.rotation.y + yaw);
    const clampedYaw = Math.max(
      Math.min(normalizedYaw, Math.PI * 0.42),
      -Math.PI * 0.42
    );

    const newRotation = new Vector3(newPitch, clampedYaw, 0);

    // Apply rotation to camera
    this.camera.rotation = newRotation;

    // Update head bone rotation with the same constraints
    if (this.headBone) {
      this.headBone.rotation = newRotation;
    }
  }

  async capturePhoto(): Promise<Blob> {
    if (!this.scene || !this.camera) {
      throw new Error("Scene not initialized");
    }

    this.scene.render();

    return new Promise((resolve, reject) => {
      try {
        Tools.CreateScreenshot(
          this.scene!.getEngine(),
          this.camera!,
          {
            precision: 1,
            width: 1920,
            height: 1080
          },
          (data: string) => {
            const base64 = data.replace(/^data:image\/(png|jpg);base64,/, "");
            const byteString = atob(base64);
            const arrayBuffer = new ArrayBuffer(byteString.length);
            const uint8Array = new Uint8Array(arrayBuffer);

            for (let i = 0; i < byteString.length; i++) {
              uint8Array[i] = byteString.charCodeAt(i);
            }

            resolve(new Blob([arrayBuffer], { type: "image/png" }));
          },
          "image/png",
          false,
          1.0
        );
      } catch (error) {
        reject(error);
      }
    });
  }
}
