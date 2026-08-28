import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

// The safelight palette from ../higgsfield-app/src/darkroom.css.
const SAFELIGHT = '#ff3b1f';
const BLACK = '#0b0708';

export const DevelopmentNight: React.FC<{frames: number}> = ({frames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // The roll "develops": the frame count climbs, then the title resolves out of the dark.
  const counter = Math.round(
    interpolate(frame, [0, 90], [0, frames], {extrapolateRight: 'clamp'})
  );
  const reveal = spring({frame: frame - 90, fps, config: {damping: 200}});
  const glow = interpolate(frame, [0, 90, 120], [0.15, 0.3, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BLACK,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 45%, ${SAFELIGHT}22, transparent 60%)`,
          opacity: glow,
        }}
      />
      <div style={{color: SAFELIGHT, fontSize: 220, fontWeight: 700, letterSpacing: -8}}>
        {counter}
        <span style={{opacity: 0.4}}>/{frames}</span>
      </div>
      <div
        style={{
          color: '#f4ece8',
          fontSize: 64,
          letterSpacing: 12,
          marginTop: 40,
          opacity: reveal,
          transform: `translateY(${interpolate(reveal, [0, 1], [30, 0])}px)`,
        }}
      >
        DARKROOM
      </div>
    </AbsoluteFill>
  );
};
