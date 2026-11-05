import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

export function useResponsiveDimensions() {
  const [dimensions, setDimensions] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    const win = Dimensions.get('window');
    return {
      width: win.width,
      height: win.height,
    };
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleResize = () => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);
      
      handleResize();

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      };
    } else {
      const subscription = Dimensions.addEventListener('change', ({ window }: { window: { width: number; height: number } }) => {
        setDimensions({
          width: window.width,
          height: window.height,
        });
      });

      return () => {
        subscription?.remove();
      };
    }
  }, []);

  return dimensions;
}
