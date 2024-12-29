import { TVector } from "../types";
import { Pose } from "./types";

interface Particle {
  pose: Pose;
  weight: number;
}

export class ParticleFilter {
  private particles: Particle[];
  private readonly numParticles: number;
  private readonly motionNoise: {
    x: number;
    y: number;
    theta: number;
  };
  private readonly measurementNoise: number;

  constructor(
    initialPose: Pose,
    numParticles: number = 100,
    spreadRadius: number = 0.5
  ) {
    this.numParticles = numParticles;
    this.motionNoise = {
      x: 0.05,
      y: 0.05,
      theta: 0.1
    };
    this.measurementNoise = 0.1;
    this.particles = this.initializeParticles(initialPose, spreadRadius);
  }

  private initializeParticles(pose: Pose, spreadRadius: number): Particle[] {
    return Array(this.numParticles)
      .fill(null)
      .map(() => ({
        pose: {
          x: pose.x + (Math.random() - 0.5) * spreadRadius,
          y: pose.y + (Math.random() - 0.5) * spreadRadius,
          theta: pose.theta + (Math.random() - 0.5) * Math.PI * 0.1
        },
        weight: 1.0 / this.numParticles
      }));
  }

  // Update particles based on motion model
  predict(deltaPosition: TVector, deltaRotation: number): void {
    this.particles = this.particles.map(particle => {
      // Add noise to motion
      const noise = {
        x: (Math.random() - 0.5) * this.motionNoise.x,
        y: (Math.random() - 0.5) * this.motionNoise.y,
        theta: (Math.random() - 0.5) * this.motionNoise.theta
      };

      // Update particle pose
      return {
        pose: {
          x: particle.pose.x + deltaPosition.x + noise.x,
          y: particle.pose.y + deltaPosition.z + noise.y,
          theta: particle.pose.theta + deltaRotation + noise.theta
        },
        weight: particle.weight
      };
    });
  }

  // Update particle weights based on sensor measurements
  update(measurements: { point: TVector; distance: number }[]): void {
    // Update weights based on how well measurements match expected values
    this.particles.forEach(particle => {
      let totalError = 0;

      measurements.forEach(measurement => {
        // Calculate expected measurement for this particle
        const expected = this.expectedMeasurement(
          particle.pose,
          measurement.point
        );
        const error = Math.abs(expected - measurement.distance);

        // Update particle weight using Gaussian probability
        totalError += this.gaussianProbability(error, this.measurementNoise);
      });

      // Update particle weight
      particle.weight *= Math.exp(-totalError);
    });

    // Normalize weights
    this.normalizeWeights();

    // Resample if effective particle count is too low
    if (this.getEffectiveParticleCount() < this.numParticles / 2) {
      this.resample();
    }
  }

  private expectedMeasurement(pose: Pose, point: TVector): number {
    const dx = point.x - pose.x;
    const dy = point.z - pose.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private gaussianProbability(error: number, sigma: number): number {
    return (
      Math.exp(-(error * error) / (2 * sigma * sigma)) /
      Math.sqrt(2 * Math.PI * sigma * sigma)
    );
  }

  private normalizeWeights(): void {
    const totalWeight = this.particles.reduce(
      (sum, particle) => sum + particle.weight,
      0
    );
    this.particles.forEach(particle => {
      particle.weight /= totalWeight;
    });
  }

  private getEffectiveParticleCount(): number {
    const sumSquaredWeights = this.particles.reduce(
      (sum, particle) => sum + particle.weight * particle.weight,
      0
    );
    return 1 / sumSquaredWeights;
  }

  private resample(): void {
    const newParticles: Particle[] = [];
    const cumulativeWeights = this.particles.reduce(
      (acc: number[], particle) => {
        acc.push((acc[acc.length - 1] || 0) + particle.weight);
        return acc;
      },
      []
    );

    for (let i = 0; i < this.numParticles; i++) {
      const random = Math.random();
      const index = cumulativeWeights.findIndex(w => w > random);
      newParticles.push({
        pose: { ...this.particles[index].pose },
        weight: 1.0 / this.numParticles
      });
    }

    this.particles = newParticles;
  }

  // Get estimated pose from weighted average of particles
  getEstimatedPose(): Pose {
    const estimate = this.particles.reduce(
      (acc, particle) => ({
        x: acc.x + particle.pose.x * particle.weight,
        y: acc.y + particle.pose.y * particle.weight,
        theta: acc.theta + particle.pose.theta * particle.weight
      }),
      { x: 0, y: 0, theta: 0 }
    );

    // Normalize theta to [-π, π]
    estimate.theta = Math.atan2(
      Math.sin(estimate.theta),
      Math.cos(estimate.theta)
    );

    return estimate;
  }

  // Get particle poses for visualization
  getParticlePoses(): Pose[] {
    return this.particles.map(p => p.pose);
  }
}
