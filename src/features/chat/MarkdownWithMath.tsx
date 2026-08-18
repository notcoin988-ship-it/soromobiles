import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { size, typography } from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';
import { hasLatex, parseLatex, type Segment } from './latex';
import { markdownStyles } from './markdownStyles';
import { CodeBlock } from './CodeBlock';
import { MathFormula } from './MathFormula';

/**
 * Ответ модели: markdown + формулы LaTeX (§7.6).
 *
 * «LaTeX — обязательно. Модель отвечает по физике и математике.»
 *
 * Как это работает: parseLatex режет текст на куски, markdown-куски отдаются
 * react-native-markdown-display, формулы — MathJax, который превращает TeX в
 * SVG прямо на устройстве (react-native-mathjax-svg из §4.2). WebView не
 * нужен, шрифты KaTeX тянуть не надо, формула получается векторной и
 * масштабируется вместе с настройкой размера шрифта.
 *
 * Быстрый путь: если формул в тексте нет — а их нет в большинстве ответов —
 * рендерится один Markdown без всякой нарезки.
 */

/**
 * Блок кода рисуется своим компонентом ради кнопки «Нусха» в правом верхнем
 * углу (§7.6, §8.3). Библиотека такой кнопки не даёт, а копировать код
 * выделением на телефоне почти невозможно: долгий тап попадает в прокрутку.
 *
 * На уровне модуля, а не в компоненте: правила не зависят ни от темы, ни от
 * пропов, а новый объект на каждый рендер заставлял бы библиотеку заново
 * разбирать разметку.
 */
const MARKDOWN_RULES = {
  fence: (node: { key: string; content: string }) => (
    <CodeBlock key={node.key} code={node.content} />
  ),
  code_block: (node: { key: string; content: string }) => (
    <CodeBlock key={node.key} code={node.content} />
  ),
};

export const MarkdownWithMath = memo(function MarkdownWithMath({ content }: { content: string }) {
  const theme = useTheme();
  const scale = useFontScale();

  const mdStyles = useMemo(() => markdownStyles(theme, scale), [theme, scale]);

  // Разбор — по содержимому, а не по каждому рендеру: ответ не меняется,
  // а перерисовок из-за темы и размера шрифта бывает много.
  const segments = useMemo(() => (hasLatex(content) ? parseLatex(content) : null), [content]);

  if (segments === null) {
    return (
      <Markdown style={mdStyles} rules={MARKDOWN_RULES}>
        {content}
      </Markdown>
    );
  }

  return (
    <View>
      {segments.map((segment, index) => (
        <SegmentView key={index} segment={segment} mdStyles={mdStyles} />
      ))}
    </View>
  );
});

function SegmentView({
  segment,
  mdStyles,
}: {
  segment: Segment;
  mdStyles: ReturnType<typeof markdownStyles>;
}) {
  const scale = useFontScale();

  if (segment.type === 'text') {
    return (
      <Markdown style={mdStyles} rules={MARKDOWN_RULES}>
        {segment.value}
      </Markdown>
    );
  }

  // Формула масштабируется вместе с настройкой размера шрифта (§7.2): иначе
  // при «Хеле калон» текст вырастет, а формулы останутся мелкими.
  const fontSize = typography.assistantBody.size * scale;

  if (!segment.display) {
    // Строчная формула стоит в потоке текста, поэтому и отступов у неё нет.
    return <MathFormula tex={segment.value} display={false} fontSize={fontSize} />;
  }

  /**
   * Блочная формула (§7.6): «шире экрана — скроллятся горизонтально внутри
   * своего контейнера, страница по горизонтали не двигается никогда».
   *
   * Отсюда ScrollView с horizontal вокруг каждой блочной формулы: без него
   * длинный интеграл растянул бы всю ленту, и текст ответов уехал бы за
   * правый край экрана.
   */
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.blockContent}
      style={styles.block}
    >
      <MathFormula
        tex={segment.value}
        display
        fontSize={fontSize * size.displayMathScale}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { marginVertical: 10 },
  blockContent: { alignItems: 'center', paddingRight: 8 },
});
