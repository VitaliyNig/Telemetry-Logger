import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransportControls, type TransportControlsSpeed } from "./TransportControls";
import type { TrackMap3DSyncMode } from "../TrackMap3D/TrackMap3D";

const meta: Meta<typeof TransportControls> = {
  title: "Telemetry/TransportControls",
  component: TransportControls,
  decorators: [
    (Story) => (
      <div style={{ width: 560, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TransportControls>;

const TRACK_LENGTH_M = 5891;
const PLAY_SECONDS = 90;

function ControlledTransport() {
  const [playing, setPlaying] = useState(false);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState<TransportControlsSpeed>(1);
  const [syncMode, setSyncMode] = useState<TrackMap3DSyncMode>("dist");
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = 0;
    function tick(ts: number) {
      const dt = lastRef.current ? Math.min(0.1, (ts - lastRef.current) / 1000) : 0;
      lastRef.current = ts;
      setDistance((prev) => {
        const next = prev + (TRACK_LENGTH_M / PLAY_SECONDS) * speed * dt;
        return next >= TRACK_LENGTH_M ? next - TRACK_LENGTH_M : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  return (
    <TransportControls
      playing={playing}
      onPlayingChange={setPlaying}
      onRestart={() => setDistance(0)}
      distance={distance}
      trackLengthM={TRACK_LENGTH_M}
      onScrub={(d) => {
        setPlaying(false);
        setDistance(d);
      }}
      speed={speed}
      onSpeedChange={setSpeed}
      syncMode={syncMode}
      onSyncModeChange={setSyncMode}
    />
  );
}

export const Default: Story = {
  render: () => <ControlledTransport />,
};

export const Playing: Story = {
  render: () => {
    const [playing, setPlaying] = useState(true);
    const [distance, setDistance] = useState(2140);
    const [speed, setSpeed] = useState<TransportControlsSpeed>(2);
    const [syncMode, setSyncMode] = useState<TrackMap3DSyncMode>("time");
    return (
      <TransportControls
        playing={playing}
        onPlayingChange={setPlaying}
        onRestart={() => setDistance(0)}
        distance={distance}
        trackLengthM={TRACK_LENGTH_M}
        onScrub={setDistance}
        speed={speed}
        onSpeedChange={setSpeed}
        syncMode={syncMode}
        onSyncModeChange={setSyncMode}
      />
    );
  },
};
