import { Card } from "@/components/ui/card";
import { useEffect, useRef } from "react";

interface MapVisionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function MapVision({ canvasRef }: MapVisionProps) {
  return (
    <Card className="fixed top-4 left-4 p-2 bg-background/80 backdrop-blur-sm">
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        className="w-64 h-64 rounded-lg"
      />
    </Card>
  );
}
