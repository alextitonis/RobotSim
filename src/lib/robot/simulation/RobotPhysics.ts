import * as CANNON from "cannon-es";
import { TVector, RobotConfig } from "../types";

export class RobotPhysics {
  body: CANNON.Body;

  constructor(position: TVector, velocity: TVector, config: RobotConfig) {
    // Create physics body
    this.body = new CANNON.Body({
      mass: config.mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: new CANNON.Box(
        new CANNON.Vec3(
          config.dimensions.x / 2,
          config.dimensions.y / 2,
          config.dimensions.z / 2
        )
      )
    });

    // Add friction and damping to make the robot more stable
    this.body.linearDamping = 0.4;
    this.body.angularDamping = 0.9;

    // Fix rotation to prevent tipping
    this.body.fixedRotation = true;
    this.body.updateMassProperties();

    // Set initial velocity
    this.body.velocity.set(velocity.x, velocity.y, velocity.z);
  }
}
