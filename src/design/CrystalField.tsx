import React, { memo, useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Фон экранов входа: несколько кристаллов, медленно плывущих в разные стороны.
 *
 * Картинка — crystal.png с продакшена, уменьшенная скриптом gen-crystal.mjs
 * (724 КБ → 129 КБ; исходное разрешение фону не нужно ни на одном экране).
 *
 * ПОЧЕМУ REANIMATED, А НЕ Animated ИЗ REACT NATIVE. Анимация идёт непрерывно,
 * пока человек читает форму и вводит почту. На Animated каждый кадр проходил
 * бы через JS-поток — тот самый, который в этот момент занят вводом текста и
 * валидацией. Reanimated крутит трансформации на UI-потоке, и ввод остаётся
 * плавным даже на Redmi 9A из §12.
 *
 * §4.2 разрешает анимации «только необходимый минимум», поэтому здесь нет ни
 * одного повторного рендера React: значения живут в useSharedValue.
 */

/**
 * Кристаллы. Движение должно читаться как дрейф, а не как езда: 18–26 секунд
 * на проход в одну сторону при смещении в 40–55 точек.
 *
 * Первая версия была вдвое медленнее (45–70 секунд) — на глаз фон казался
 * неподвижным, и вся анимация пропадала впустую. Дальше ускорять нельзя:
 * за спиной формы входа быстрое движение начинает перетягивать внимание с
 * полей ввода.
 *
 * Периоды намеренно некратные — иначе кристаллы синхронизируются и фон
 * выглядит как одна плита.
 */
const CRYSTALS = [
  { size: 0.55, left: -0.18, top: 0.04, dx: 44, dy: 52, rotate: 14, seconds: 21, opacity: 0.16 },
  { size: 0.42, left: 0.68, top: 0.16, dx: -48, dy: 38, rotate: -17, seconds: 26, opacity: 0.12 },
  { size: 0.5, left: 0.55, top: 0.66, dx: 40, dy: -46, rotate: 12, seconds: 18, opacity: 0.14 },
  { size: 0.36, left: -0.1, top: 0.74, dx: 55, dy: -32, rotate: -15, seconds: 23, opacity: 0.1 },
] as const;

export const CrystalField = memo(function CrystalField() {
  const { width, height } = useWindowDimensions();

  /**
   * «Уменьшить движение» в системных настройках. Для части людей плывущий фон
   * вызывает укачивание, а на Android этот переключатель ещё и включают ради
   * экономии батареи. Уважаем: кристаллы остаются, движение выключается.
   */
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {CRYSTALS.map((crystal, index) => (
        <Crystal
          key={index}
          crystal={crystal}
          screenWidth={width}
          screenHeight={height}
          animated={!reduceMotion}
        />
      ))}
    </View>
  );
});

function Crystal({
  crystal,
  screenWidth,
  screenHeight,
  animated,
}: {
  crystal: (typeof CRYSTALS)[number];
  screenWidth: number;
  screenHeight: number;
  animated: boolean;
}) {
  // 0 → 1 и обратно. Одно значение на кристалл: смещения по обеим осям и
  // поворот — производные от него, поэтому траектория остаётся связной.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, {
        duration: crystal.seconds * 1000,
        // Плавный вход и выход: с линейным временем на разворотах видно рывок.
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      // true — «туда-обратно». Без него кристалл в конце цикла прыгал бы в
      // исходную точку.
      true,
    );
  }, [animated, crystal.seconds, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * crystal.dx },
      { translateY: progress.value * crystal.dy },
      { rotate: `${progress.value * crystal.rotate}deg` },
    ],
  }));

  const side = screenWidth * crystal.size;

  return (
    <Animated.View
      style={[
        styles.crystal,
        {
          width: side,
          height: side,
          left: screenWidth * crystal.left,
          top: screenHeight * crystal.top,
          opacity: crystal.opacity,
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/images/crystal-bg.png')}
        style={styles.image}
        resizeMode="contain"
        // Фон, а не содержание: программе чтения с экрана здесь нечего сказать.
        accessible={false}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  crystal: { position: 'absolute' },
  image: { width: '100%', height: '100%' },
});
