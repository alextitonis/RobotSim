import React, { useEffect, useRef } from "react";
import {
  Engine,
  Scene,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ArcRotateCamera,
  TransformNode,
  Quaternion,
  RenderTargetTexture,
  SceneLoader
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { Robot } from "@/lib/robot/Robot";
import * as CANNON from "cannon-es";
import { FirstPersonCamera } from "@/lib/robot/simulation/FirstPersonCamera";
import { RobotVision } from "@/components/RobotVision";

interface Character {
  mesh: TransformNode | null;
  physicsBody: CANNON.Body | null;
}

const SceneComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionCanvasRef = useRef<HTMLCanvasElement>(null);

  const standingCharacterRef = useRef<Character>({
    mesh: null,
    physicsBody: null
  });
  const robotMeshRef = useRef<Character>({
    mesh: null,
    physicsBody: null
  });
  const robotRef = useRef<Robot | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !visionCanvasRef.current) return;

    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);

    // Create camera
    const camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 3,
      10,
      Vector3.Zero(),
      scene
    );

    if (canvasRef.current) {
      camera.attachControl(canvasRef.current, true);
    }

    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 20;

    // Create lights
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Create ground
    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: 20, height: 20 },
      scene
    );
    const groundMaterial = new StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);
    ground.material = groundMaterial;

    // Create physics world
    const physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    // Better default materials
    const defaultMaterial = new CANNON.Material("default");
    const defaultContactMaterial = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.2,
        contactEquationStiffness: 1e6,
        contactEquationRelaxation: 3
      }
    );
    physicsWorld.addContactMaterial(defaultContactMaterial);
    physicsWorld.defaultContactMaterial = defaultContactMaterial;

    // Add ground physics body
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: defaultMaterial,
      position: new CANNON.Vec3(0, 0, 0)
    });
    groundBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI / 2
    );
    physicsWorld.addBody(groundBody);

    // Create random obstacles
    const createRandomObstacles = () => {
      const numObstacles = 10;
      const minDistance = 3; // Increased minimum distance
      const obstacles: {
        x: number;
        z: number;
        width: number;
        depth: number;
      }[] = [];
      const areaSize = 12; // Increased area size

      // Helper to check if a new position overlaps with existing obstacles
      const isValidPosition = (
        x: number,
        z: number,
        width: number,
        depth: number
      ) => {
        // Keep away from center
        if (Math.sqrt(x * x + z * z) < 3) return false;

        const margin = 1.0; // Increased margin between obstacles
        for (const obs of obstacles) {
          const dx = Math.abs(x - obs.x);
          const dz = Math.abs(z - obs.z);
          const minX = (width + obs.width) / 2 + margin;
          const minZ = (depth + obs.depth) / 2 + margin;
          if (dx < minX && dz < minZ) return false;
        }
        return true;
      };

      for (let i = 0; i < numObstacles; i++) {
        let x, z, width, depth, height;
        let attempts = 0;
        const maxAttempts = 50;

        // Keep trying positions until we find a valid one
        do {
          const angle = Math.random() * Math.PI * 2;
          const radius = 3 + Math.random() * (areaSize / 2 - 3); // Minimum 3 units from center
          x = Math.cos(angle) * radius;
          z = Math.sin(angle) * radius;

          width = 1.2 + Math.random() * 1.3;
          depth = 1.2 + Math.random() * 1.3;
          height = 1.5 + Math.random() * 2;

          attempts++;
          if (attempts > maxAttempts) break;
        } while (!isValidPosition(x, z, width, depth));

        if (attempts <= maxAttempts) {
          obstacles.push({ x, z, width, depth });

          // Create box mesh
          const box = MeshBuilder.CreateBox(
            `obstacle${i}`,
            { width, height, depth },
            scene
          );
          box.position = new Vector3(x, height / 2, z);

          // Better looking materials
          const material = new StandardMaterial(`obstacleMaterial${i}`, scene);
          const hue = Math.random();
          const saturation = 0.5 + Math.random() * 0.3;
          const luminance = 0.4 + Math.random() * 0.3;

          // Convert HSL to RGB for more pleasing colors
          const phi = hue * Math.PI * 2;
          material.diffuseColor = new Color3(
            luminance + saturation * Math.cos(phi),
            luminance + saturation * Math.cos(phi + (2 * Math.PI) / 3),
            luminance + saturation * Math.cos(phi + (4 * Math.PI) / 3)
          );
          box.material = material;

          // Add physics with better properties
          const boxBody = new CANNON.Body({
            mass: 0,
            material: defaultMaterial,
            position: new CANNON.Vec3(x, height / 2, z),
            shape: new CANNON.Box(
              new CANNON.Vec3(width / 2, height / 2, depth / 2)
            )
          });
          // Random rotation between -15 and 15 degrees
          boxBody.quaternion.setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0),
            ((Math.random() - 0.5) * Math.PI) / 6
          );
          physicsWorld.addBody(boxBody);
        }
      }
    };

    createRandomObstacles();

    // Load GLB models
    const loadCharacters = async () => {
      try {
        // Load robot model
        const robotResult = await SceneLoader.ImportMeshAsync(
          "",
          "/avatars/",
          "robot.glb",
          scene
        );
        robotMeshRef.current.mesh = robotResult.meshes[0];
        robotMeshRef.current.mesh.position = new Vector3(0, 1, 0);

        // Better robot physics with proper collider size
        const robotBody = new CANNON.Body({
          mass: 50,
          material: defaultMaterial,
          position: new CANNON.Vec3(0, 1, 0),
          shape: new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)), // Larger collider
          fixedRotation: true,
          linearDamping: 0.4,
          angularDamping: 0.4
        });
        physicsWorld.addBody(robotBody);
        robotMeshRef.current.physicsBody = robotBody;

        // Initialize robot and camera after mesh and physics are set up
        const robotCamera = new FirstPersonCamera();
        robotRef.current = new Robot(
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          {
            dimensions: { x: 1, y: 2, z: 0.5 },
            mass: 5,
            maxSpeed: 5,
            maxRotationSpeed: Math.PI / 2,
            llmType: "chatgpt",
            type: "simulation"
          },
          robotCamera
        );

        // Initialize robot's camera with scene after robot is created
        robotCamera.initialize({ scene });

        // Load standing character
        /*const characterResult = await SceneLoader.ImportMeshAsync(
          "",
          "/avatars/",
          "character.glb",
          scene
        );
        standingCharacterRef.current.mesh = characterResult.meshes[0];
        standingCharacterRef.current.mesh.position = new Vector3(-2, 1, -2);
        standingCharacterRef.current.mesh.rotation = new Vector3(0, 90, 0);

        // Better character physics with proper collider size
        const characterBody = new CANNON.Body({
          mass: 50,
          material: defaultMaterial,
          position: new CANNON.Vec3(-2, 1, -2),
          shape: new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)),
          fixedRotation: true,
          linearDamping: 0.9, // Increased damping
          angularDamping: 0.9 // Increased damping
        });

        // Lock rotations to keep character upright
        characterBody.angularFactor.set(0, 0, 0);

        physicsWorld.addBody(characterBody);
        standingCharacterRef.current.physicsBody = characterBody;*/
      } catch (error) {
        console.error("Error loading GLB models:", error);
      }
    };

    loadCharacters();

    // Physics update loop
    const timeStep = 1 / 60;
    scene.onBeforeRenderObservable.add(() => {
      physicsWorld.step(timeStep);

      // Update mesh positions based on physics
      if (robotMeshRef.current.mesh && robotMeshRef.current.physicsBody) {
        robotMeshRef.current.mesh.position.set(
          robotMeshRef.current.physicsBody.position.x,
          robotMeshRef.current.physicsBody.position.y,
          robotMeshRef.current.physicsBody.position.z
        );
        robotMeshRef.current.mesh.rotationQuaternion = new Quaternion(
          robotMeshRef.current.physicsBody.quaternion.x,
          robotMeshRef.current.physicsBody.quaternion.y,
          robotMeshRef.current.physicsBody.quaternion.z,
          robotMeshRef.current.physicsBody.quaternion.w
        );
      }

      if (
        standingCharacterRef.current.mesh &&
        standingCharacterRef.current.physicsBody
      ) {
        standingCharacterRef.current.mesh.position.set(
          standingCharacterRef.current.physicsBody.position.x,
          standingCharacterRef.current.physicsBody.position.y,
          standingCharacterRef.current.physicsBody.position.z
        );
        standingCharacterRef.current.mesh.rotationQuaternion = new Quaternion(
          standingCharacterRef.current.physicsBody.quaternion.x,
          standingCharacterRef.current.physicsBody.quaternion.y,
          standingCharacterRef.current.physicsBody.quaternion.z,
          standingCharacterRef.current.physicsBody.quaternion.w
        );
      }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // Setup robot vision
    const renderTarget = new RenderTargetTexture(
      "robotVision",
      { width: 320, height: 240 },
      scene,
      false
    );
    scene.customRenderTargets.push(renderTarget);

    scene.onAfterRenderObservable.add(async () => {
      if (!visionCanvasRef.current) return;
      const context = visionCanvasRef.current.getContext("2d");
      if (!context) return;

      const robotCamera = robotRef.current?.camera?.getCamera();
      if (robotCamera) {
        renderTarget.activeCamera = robotCamera;
        renderTarget.renderList = scene.meshes;
        renderTarget.render();

        const data = await renderTarget.readPixels();
        if (data) {
          const imageData = context.createImageData(320, 240);
          const uint8Array = new Uint8Array(data.buffer);

          for (let i = 0; i < 240; i++) {
            const srcRow = (239 - i) * 320 * 4;
            const dstRow = i * 320 * 4;
            for (let j = 0; j < 320 * 4; j++) {
              imageData.data[dstRow + j] = uint8Array[srcRow + j];
            }
          }

          context.putImageData(imageData, 0, 0);
        }
      }
    });

    return () => {
      engine.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />
      <RobotVision canvasRef={visionCanvasRef} />
    </>
  );
};

export default SceneComponent;
