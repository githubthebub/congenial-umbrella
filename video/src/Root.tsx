import {Composition} from 'remotion';
import {DevelopmentNight} from './DevelopmentNight';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DevelopmentNight"
      component={DevelopmentNight}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{frames: 24}}
    />
  );
};
