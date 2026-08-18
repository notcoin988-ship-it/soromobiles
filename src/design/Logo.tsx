import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

import { size } from './tokens';

/**
 * Логотип zehn (§4.2, §7.5).
 *
 * Анимация — тот самый soro-animation.json, что крутится на sorollm.tj:
 * 120 кадров при 60 fps (2 секунды), два полных оборота с пульсацией
 * масштаба 100 → 50 → 120 → 100. Внутри Lottie лежит растровая иконка
 * 443×385, поэтому это именно анимация продакшена, а не пересъёмка.
 *
 * Статичный вариант нужен там, где движение мешает: в шапке drawer логотип
 * висит постоянно, и вертящийся значок над списком диалогов раздражал бы.
 * Плюс §4.2 требует «только необходимый минимум» анимаций.
 */

export type LogoProps = {
  /** Сторона квадрата в px. По умолчанию — как в пустом состоянии чата. */
  width?: number;
  /** Крутится ли логотип. По умолчанию нет. */
  animated?: boolean;
  /** Белый вариант — для тёмного рубинового фона. */
  variant?: 'ruby' | 'white';
  style?: StyleProp<ViewStyle>;
};

export function Logo({ width = size.logo, animated = false, variant = 'ruby', style }: LogoProps) {
  return (
    <View style={[{ width, height: width }, style]} accessibilityRole="image">
      {animated ? (
        <LottieView
          source={require('../../assets/animations/soro-animation.json')}
          autoPlay
          loop
          // resizeMode обязателен: исходник 512×512, а рисуем в любом размере.
          resizeMode="contain"
          style={styles.fill}
        />
      ) : (
        <Image
          source={
            variant === 'white'
              ? require('../../assets/images/soro-logo-white.png')
              : require('../../assets/images/soro-logo.png')
          }
          style={styles.fill}
          resizeMode="contain"
          // Логотип — украшение рядом с текстом, отдельно озвучивать нечего.
          accessible={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
