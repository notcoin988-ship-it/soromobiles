import React, { memo } from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import {
  ICONS,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
  type IconName,
  type IconShape,
} from './iconPaths';

/**
 * Иконка из собственного набора (§4.2).
 *
 * Сторонних icon-пакетов в проекте нет — ТЗ запрещает их прямо. Формы лежат
 * в iconPaths.ts, портированные с продакшена; здесь только отрисовка.
 *
 * Цвет передаётся через currentColor: одна и та же иконка обязана быть
 * text2 в панели, ruby400 в активном состоянии и textOnRuby на кнопке, а
 * дублировать формы ради трёх цветов бессмысленно.
 */

export type IconProps = {
  name: IconName;
  /** Сторона в px. По умолчанию 20 — как у веб-компонента Ic. */
  size?: number;
  color: string;
  /** Переопределение толщины обводки. По умолчанию — из набора. */
  strokeWidth?: number;
};

export const Icon = memo(function Icon({ name, size = 20, color, strokeWidth }: IconProps) {
  const definition = ICONS[name];
  const filled = 'fill' in definition && definition.fill !== undefined;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={ICON_VIEW_BOX}
      // Залитые иконки (например «Стоп») обводки не имеют, и наоборот.
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={
        strokeWidth ??
        ('strokeWidth' in definition ? definition.strokeWidth : undefined) ??
        ICON_STROKE_WIDTH
      }
      // Скруглённые концы и стыки — как в исходном наборе.
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/*
        Приведение к IconShape намеренно: таблица объявлена через `as const`,
        и типы сужаются до тех фигур, что реально встретились в наборе. Без
        приведения ветка line оказывается недостижимой по типам, и добавление
        первой же иконки с line потребовало бы править этот файл.
      */}
      {(definition.shapes as readonly IconShape[]).map((shape, index) => {
        switch (shape.kind) {
          case 'path':
            return <Path key={index} d={shape.d} />;
          case 'circle':
            return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />;
          case 'rect':
            return (
              <Rect
                key={index}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rx={shape.rx ?? undefined}
              />
            );
          default:
            return <Line key={index} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />;
        }
      })}
    </Svg>
  );
});
