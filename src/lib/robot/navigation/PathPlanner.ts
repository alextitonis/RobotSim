import { OccupancyGrid, Pose } from "./types";

interface RRTNode {
  x: number;
  y: number;
  parent: RRTNode | null;
}

export class PathPlanner {
  private readonly maxIterations = 1000;
  private readonly stepSize = 0.5;
  private readonly goalBias = 0.1;
  private readonly timeout = 2000;

  constructor(private readonly occupancyThreshold: number = 0.65) {}

  planPath(start: Pose, goal: Pose, map: OccupancyGrid): Pose[] {
    const startTime = Date.now();
    const nodes: RRTNode[] = [{ x: start.x, y: start.y, parent: null }];

    const startGrid = this.worldToGrid(
      { x: start.x, y: start.y, theta: 0 },
      map
    );
    const goalGrid = this.worldToGrid({ x: goal.x, y: goal.y, theta: 0 }, map);

    if (
      !this.isValidNode(
        { x: startGrid.x, y: startGrid.y, parent: null },
        map
      ) ||
      !this.isValidNode({ x: goalGrid.x, y: goalGrid.y, parent: null }, map)
    ) {
      console.warn("Start or goal position is invalid");
      return [];
    }

    for (let i = 0; i < this.maxIterations; i++) {
      if (Date.now() - startTime > this.timeout) {
        console.warn("Path planning timeout");
        return [];
      }

      const target =
        Math.random() < this.goalBias
          ? { x: goal.x, y: goal.y }
          : this.sampleFreeSpace(map);

      const nearest = this.findNearestNode(nodes, target);
      const newNode = this.extend(nearest, target);

      if (!newNode || !this.isValidPath(nearest, newNode, map)) {
        continue;
      }

      nodes.push(newNode);

      if (this.distanceBetween(newNode, goal) < this.stepSize * 1.5) {
        console.log("Path found in", i, "iterations");
        return this.extractPath(nodes, newNode, start, goal);
      }
    }

    console.warn("No path found after", this.maxIterations, "iterations");
    return [];
  }

  private sampleFreeSpace(map: OccupancyGrid): { x: number; y: number } {
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = map.origin.x + Math.random() * map.width * map.resolution;
      const y = map.origin.y + Math.random() * map.height * map.resolution;

      const gridPos = this.worldToGrid({ x, y, theta: 0 }, map);
      if (this.isValidNode({ x: gridPos.x, y: gridPos.y, parent: null }, map)) {
        return { x, y };
      }
    }
    return {
      x: map.origin.x + Math.random() * map.width * map.resolution,
      y: map.origin.y + Math.random() * map.height * map.resolution
    };
  }

  private findNearestNode(
    nodes: RRTNode[],
    target: { x: number; y: number }
  ): RRTNode {
    let nearest = nodes[0];
    let minDist = this.distanceBetween(nearest, target);

    for (const node of nodes) {
      const dist = this.distanceBetween(node, target);
      if (dist < minDist) {
        nearest = node;
        minDist = dist;
      }
    }

    return nearest;
  }

  private extend(from: RRTNode, to: { x: number; y: number }): RRTNode | null {
    const dist = this.distanceBetween(from, to);
    if (dist < this.stepSize) {
      return { x: to.x, y: to.y, parent: from };
    }

    const theta = Math.atan2(to.y - from.y, to.x - from.x);
    return {
      x: from.x + this.stepSize * Math.cos(theta),
      y: from.y + this.stepSize * Math.sin(theta),
      parent: from
    };
  }

  private isValidPath(from: RRTNode, to: RRTNode, map: OccupancyGrid): boolean {
    const steps = Math.ceil(
      this.distanceBetween(from, to) / (map.resolution / 4)
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;

      const gridPos = this.worldToGrid({ x, y, theta: 0 }, map);
      if (
        !this.isValidNode({ x: gridPos.x, y: gridPos.y, parent: null }, map)
      ) {
        return false;
      }
    }
    return true;
  }

  private extractPath(
    nodes: RRTNode[],
    endNode: RRTNode,
    start: Pose,
    goal: Pose
  ): Pose[] {
    const path: Pose[] = [{ ...goal }];
    let current: RRTNode | null = endNode;

    while (current?.parent) {
      path.unshift({
        x: current.x,
        y: current.y,
        theta: 0
      });
      current = current.parent;
    }

    path.unshift({ ...start });
    return this.smoothPath(path);
  }

  private distanceBetween(
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private worldToGrid(
    pose: Pose,
    map: OccupancyGrid
  ): { x: number; y: number } {
    return {
      x: Math.floor((pose.x - map.origin.x) / map.resolution),
      y: Math.floor((pose.y - map.origin.y) / map.resolution)
    };
  }

  private gridToWorld(x: number, y: number, map: OccupancyGrid): Pose {
    return {
      x: x * map.resolution + map.origin.x,
      y: y * map.resolution + map.origin.y,
      theta: 0 // Will be calculated during path smoothing
    };
  }

  private isValidNode(node: RRTNode, map: OccupancyGrid): boolean {
    if (
      node.x < 0 ||
      node.x >= map.width ||
      node.y < 0 ||
      node.y >= map.height
    ) {
      return false;
    }

    const margin = 2;
    for (let dy = -margin; dy <= margin; dy++) {
      for (let dx = -margin; dx <= margin; dx++) {
        const checkY = Math.floor(node.y + dy);
        const checkX = Math.floor(node.x + dx);

        if (
          checkY >= 0 &&
          checkY < map.height &&
          checkX >= 0 &&
          checkX < map.width
        ) {
          const cell = map.cells[checkY][checkX];
          if (cell.occupied || cell.probability > 0.5) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private reconstructPath(goalNode: RRTNode, map: OccupancyGrid): Pose[] {
    const path: Pose[] = [];
    let current: RRTNode | null = goalNode;

    while (current) {
      path.unshift(this.gridToWorld(current.x, current.y, map));
      current = current.parent;
    }

    return this.smoothPath(path);
  }

  private smoothPath(path: Pose[]): Pose[] {
    if (path.length <= 2) return path;

    const smoothed: Pose[] = [path[0]];

    // Calculate headings between waypoints
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const current = path[i];

      // Calculate heading to next waypoint
      const theta = Math.atan2(current.y - prev.y, current.x - prev.x);

      // Update previous pose's heading
      smoothed[smoothed.length - 1].theta = theta;

      // Add current waypoint
      smoothed.push({ ...current, theta });
    }

    return smoothed;
  }
}
