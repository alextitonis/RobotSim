import { SensorReading } from "../sensors/types";
import { TVector } from "../types";

export class VectorFieldHistogram {
  private readonly numSectors = 72; // 5-degree sectors
  private readonly safeDistance = 1.0; // meters
  private readonly maxRange = 5.0; // meters
  private readonly sectorSize = (2 * Math.PI) / this.numSectors;
  private readonly alpha = 0.5; // Target direction weight
  private readonly beta = 0.3; // Current direction weight

  findBestDirection(
    sensorData: SensorReading[],
    targetAngle: number,
    currentVelocity: TVector
  ): number {
    // Build polar histogram
    const histogram = new Array(this.numSectors).fill(0);

    // Accumulate obstacle densities
    sensorData.forEach(reading => {
      if (reading.distance > this.maxRange) return;

      // Calculate angle to obstacle
      const angle = Math.atan2(reading.point.z, reading.point.x);
      const sector = this.angleToSector(angle);

      // Add weighted obstacle density
      const weight = 1 - Math.min(reading.distance / this.safeDistance, 1);
      histogram[sector] += weight;
    });

    // Smooth histogram
    const smoothed = this.smoothHistogram(histogram);

    // Find candidate valleys
    const valleys = this.findValleys(smoothed);

    // Select best valley based on cost function
    return this.selectBestValley(
      valleys,
      targetAngle,
      Math.atan2(currentVelocity.z, currentVelocity.x)
    );
  }

  private smoothHistogram(histogram: number[]): number[] {
    const smoothed = [...histogram];
    const kernel = [0.1, 0.2, 0.4, 0.2, 0.1];

    for (let i = 0; i < this.numSectors; i++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const idx = (i + k - 2 + this.numSectors) % this.numSectors;
        sum += histogram[idx] * kernel[k];
      }
      smoothed[i] = sum;
    }

    return smoothed;
  }

  private findValleys(histogram: number[]): number[] {
    const threshold = 0.3;
    const valleys: number[] = [];

    for (let i = 0; i < this.numSectors; i++) {
      if (histogram[i] < threshold) {
        const prev = histogram[(i - 1 + this.numSectors) % this.numSectors];
        const next = histogram[(i + 1) % this.numSectors];

        if (histogram[i] <= prev && histogram[i] <= next) {
          valleys.push(this.sectorToAngle(i));
        }
      }
    }

    return valleys;
  }

  private selectBestValley(
    valleys: number[],
    targetAngle: number,
    currentAngle: number
  ): number {
    if (valleys.length === 0) return currentAngle;

    let bestValley = valleys[0];
    let minCost = Infinity;

    valleys.forEach(valley => {
      const targetDiff = this.angleDifference(valley, targetAngle);
      const currentDiff = this.angleDifference(valley, currentAngle);

      const cost =
        this.alpha * Math.abs(targetDiff) + this.beta * Math.abs(currentDiff);

      if (cost < minCost) {
        minCost = cost;
        bestValley = valley;
      }
    });

    return bestValley;
  }

  private angleToSector(angle: number): number {
    const normalized = (angle + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor(normalized / this.sectorSize);
  }

  private sectorToAngle(sector: number): number {
    return sector * this.sectorSize + this.sectorSize / 2;
  }

  private angleDifference(a: number, b: number): number {
    let diff = a - b;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }
}
