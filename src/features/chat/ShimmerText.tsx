import React, { memo, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { MAX_FONT_SIZE_MULTIPLIER, shimmer } from '../../design/tokens';
import { useTheme } from '../../store/settings';

/**
 * Мерцающий текст «Фикр дорам…» (§7.5, класс .shimmer-text на проде).
 *
 * Значения сняты со скомпилированного CSS sorollm.tj и лежат в токенах:
 * градиент 90deg с четырьмя стопами (text3 20% → text 45% → ruby400 55% →
 * text3 80%), полотно вдвое шире контейнера, 2.2 секунды линейно, бесконечно.
 *
 * КАК ЭТО РАБОТАЕТ В RN. В вебе это background-clip: text — свойства, которого
 * в React Native нет. Здесь тот же эффект собирается из двух частей: маска в
 * форме текста (MaskedView) и градиент под ней, который ездит по горизонтали.
 *
 * Движение — на UI-потоке через Reanimated: индикатор показывается ровно
 * тогда, когда JS-поток занят разбором приходящих токенов, и анимация на нём
 * дёргалась бы (§12).
 */

export const ShimmerText = memo(function ShimmerText({
  text,
  style,
  width,
}: {
  text: string;
  style: TextStyle;
  /** Ширина области мерцания. Градиент вдвое шире и ездит на эту величину. */
  width: number;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      // Линейно и без разворота: в вебе это тоже равномерный проход слева
      // направо, а не маятник.
      withTiming(1, { duration: shimmer.durationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + progress.value * width * shimmer.widthMultiplier }],
  }));

  const label = (
    <Text style={style} maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
      {text}
    </Text>
  );

  // Без анимации показываем обычный текст: маска и градиент ради статичной
  // картинки — лишняя работа на слабом устройстве.
  if (reduceMotion) return label;

  return (
    <MaskedView maskElement={label}>
      {/* Прозрачная копия задаёт высоту: маска сама размеров не имеет. */}
      <View style={styles.sizer}>{label}</View>

      <Animated.View style={[StyleSheet.absoluteFill, animated]}>
        <LinearGradient
          colors={shimmer.colorsFor(theme)}
          locations={shimmer.locations}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: width * shimmer.widthMultiplier, height: '100%' }}
        />
      </Animated.View>
    </MaskedView>
  );
});

const styles = StyleSheet.create({
  sizer: { opacity: 0 },
});
