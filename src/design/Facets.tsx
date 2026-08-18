import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { facets } from './tokens';

/**
 * Сетка граней (.facets) — второй фоновый слой поверх свечения (§7.1).
 *
 * ТЗ задаёт только непрозрачность: «непрозрачность слоя на экране приветствия
 * — 0.28 для сетки граней». Сама геометрия снята с CSS прода: две диагонали,
 * 135° и 45°, плитки 90 и 64 px, белый с альфой 4% и 3%. Плитки печёт
 * scripts/gen-facets.mjs, здесь они только размножаются.
 *
 * ДВА СЛОЯ, А НЕ ОДИН. Периоды 90 и 64 не кратны друг другу: чтобы свести их
 * в одну плитку, пришлось бы взять наименьшее общее кратное — 2880 px, то
 * есть картинку в тысячу раз тяжелее. Два спрайта по 400 байт дешевле.
 *
 * ОТКЛОНЕНИЕ: mix-blend-mode: screen из CSS в React Native отсутствует. На
 * тёмном фоне для белого с альфой 3–4% screen и обычное наложение совпадают с
 * точностью до единиц из 255 — разницу не видно. На светлой теме screen
 * осветлял бы сильнее, но там сетка и так почти не читается.
 */
export const Facets = memo(function Facets() {
  return (
    <View style={styles.layer}>
      <Image
        source={require('../../assets/images/facets-135.png')}
        style={styles.tile}
        resizeMode="repeat"
      />
      <Image
        source={require('../../assets/images/facets-45.png')}
        style={styles.tile}
        resizeMode="repeat"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: facets.opacity,
    // Фон: касания уходят к тому, что лежит выше.
    pointerEvents: 'none',
  },
  tile: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
