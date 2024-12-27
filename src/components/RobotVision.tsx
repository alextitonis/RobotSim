import { Card } from "@/components/ui/card";

interface RobotVisionProps {
  width?: number;
  height?: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function RobotVision({
  width = 320,
  height = 240,
  canvasRef
}: RobotVisionProps) {
  return (
    <Card className="fixed top-4 right-4 z-50 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full"
      />
    </Card>
  );
}
