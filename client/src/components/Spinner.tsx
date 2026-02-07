// =============================================================================
// Spinner Component (OpenTUI doesn't include one)
// =============================================================================

import { useState, useEffect } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
  color?: string;
}

export function Spinner({ color = "#00ff00" }: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <text>
      <span fg={color}>{FRAMES[frame]}</span>
    </text>
  );
}
