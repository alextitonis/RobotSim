export interface GridCell {
  occupied: boolean;
  probability: number;
  cost: number;
  lastUpdated: number;
}

export interface OccupancyGrid {
  cells: GridCell[][];
  resolution: number; // meters per cell
  width: number; // number of cells
  height: number; // number of cells
  origin: {
    x: number;
    y: number;
  };
}

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export interface NavigationGoal {
  pose: Pose;
  tolerance: {
    position: number;
    orientation: number;
  };
}

export type NavigationStatus =
  | "idle"
  | "planning"
  | "moving"
  | "blocked"
  | "goal_reached"
  | "failed";

export interface NavigationState {
  currentPose: Pose;
  currentMap: OccupancyGrid;
  isNavigating: boolean;
  currentGoal?: NavigationGoal;
  path?: Pose[];
  status: NavigationStatus;
  lastError?: string;
}
