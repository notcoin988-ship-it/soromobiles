import React, { memo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutRectangle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { isLowMemoryDevice } from './deviceTier';
import { glowField } from './tokens';

/**
 * Фоновое свечение экрана приветствия (.glow-field, §7.1, §7.5).
 *
 * На проде это три радиальных градиента поверх bg0 — они дают всю
 * «атмосферу» пустого экрана, без них он выглядит плоским чёрным
 * прямоугольником. Значения сняты с CSS sorollm.tj.
 *
 * Реализация на react-native-svg, потому что expo-linear-gradient умеет
 * только линейные градиенты, а здесь нужны эллиптические радиальные.
 *
 * Слой выходит за границы контейнера на 20% с каждой стороны (inset: -20% в
 * CSS): центры двух из трёх градиентов лежат за краем экрана, и без выноса
 * их размытые края обрубались бы ровной линией.
 *
 * ОТКЛОНЕНИЕ: filter: blur(8px) не воспроизводится. Фильтры SVG в React
 * Native поддерживаются частично и стоят дорого на слабых устройствах, а
 * градиенты и так мягкие — на глаз разница в пределах шума. §12 к тому же
 * требует уметь отключать свечение на устройствах с малой памятью.
 */

export const GlowField = memo(function GlowField({ enabled }: { enabled?: boolean }) {
  // Реальный размер слоя в пикселях: по нему считаются радиусы (см. ниже).
  const [box, setBox] = useState<LayoutRectangle | null>(null);

  /**
   * Порог §12 проверяется здесь, а не в каждом месте вызова: забыть один
   * вызов проще, чем найти потом причину просадки на Redmi 9A. Явный проп
   * остаётся для экрана диагностики, где слой нужно показать принудительно
   * или, наоборот, убрать.
   */
  if (enabled === false) return null;

  /**
   * Слабое устройство — статичная картинка вместо трёх живых градиентов.
   *
   * §12 дословно: «Фоновые градиенты glow-field на устройствах с < 3 ГБ ОЗУ
   * заменяются статичным PNG». Раньше слой на таких аппаратах просто не
   * рисовался, и фон оставался плоским чёрным — то есть основная целевая
   * аудитория (Redmi 9A и подобные) видела продукт беднее, чем он есть.
   * Картинка печётся заранее скриптом gen-glow.mjs, весит 11 КБ и рисуется
   * одним спрайтом без единого прохода композитора по градиентам.
   */
  if (enabled === undefined && isLowMemoryDevice) {
    return (
      <Image
        source={require('../../assets/images/glow-bg.png')}
        style={styles.static}
        resizeMode="cover"
      />
    );
  }

  // `-20%` в типах RN не проходит: проценты там объявлены как `${number}%`
  // без знака. Приводим явно — значение остаётся тем же.
  const inset = `${glowField.insetRatio * 100}%` as `${number}%`;

  return (
    <View
      style={[styles.container, { top: inset, right: inset, bottom: inset, left: inset }]}
      onLayout={(event) => setBox(event.nativeEvent.layout)}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {glowField.layers.map((layer, index) => (
            <RadialGradient key={index} id={`glow${index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={layer.color} />
              {/* stop из CSS — точка, где слой окончательно растворяется. */}
              <Stop offset={layer.stop} stopColor={layer.color} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>

        {glowField.layers.map((layer, index) => (
          <Ellipse
            key={index}
            /**
             * Доли из CSS отсчитываются от ВИДИМОЙ области, а не от слоя,
             * растянутого на 20% в каждую сторону.
             *
             * На мониторе разница невелика, а на телефоне решает всё: слой
             * высотой 1.4 × 2340 = 3276 px уводит центр второго пятна на
             * y ≈ 2415, третьего — на 3463, то есть оба оказываются ниже
             * экрана, и остаются одни хвосты. Композиция прода — пятно справа
             * сверху, пятно слева снизу, подсветка снизу по центру — при таком
             * пересчёте сохраняется на любом соотношении сторон.
             */
            cx={box ? box.width * (0.2 / 1.4) + (parseFloat(layer.cx) / 100) * (box.width / 1.4) : layer.cx}
            cy={box ? box.height * (0.2 / 1.4) + (parseFloat(layer.cy) / 100) * (box.height / 1.4) : layer.cy}
            /**
             * Радиусы — доля ШИРИНЫ по обеим осям, а не ширины и высоты.
             *
             * В CSS проценты радиуса берутся от соответствующей стороны, и на
             * широком мониторе сайта это даёт круглые мягкие пятна. Телефон
             * втрое выше, чем шире: ry в 50% высоты растягивает пятно в
             * вертикальную полосу, её центр уезжает за нижний край, и на экране
             * остаётся еле заметный хвост. Замер на эмуляторе: подъём фона
             * всего на 10–15 единиц вместо ожидаемых по CSS ~65.
             *
             * Пока размер не измерен, рисуем по-старому — первый кадр всё равно
             * перерисуется сразу после onLayout.
             */
            rx={box ? (parseFloat(layer.rx) / 100) * box.width : layer.rx}
            ry={box ? (parseFloat(layer.ry) / 100) * box.width : layer.ry}
            fill={`url(#glow${index})`}
          />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  // Статичный слой лежит ровно по экрану: он уже нарисован с запасом по краям.
  // Касания уходят к тому, что лежит выше: это фон, а не элемент управления.
  static: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  container: {
    position: 'absolute',
    // Свечение — фон: касания уходят к тому, что лежит выше.
    pointerEvents: 'none',
  },
});
