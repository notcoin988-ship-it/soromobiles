import type { TextStyle, ViewStyle } from 'react-native';

import {
  fontFamilyFor,
  radius,
  ruby,
  type Theme,
} from '../../design/tokens';

/**
 * Стили markdown для react-native-markdown-display.
 *
 * Портированы из .markdown-content живого CSS sorollm.tj — не «на глаз».
 * Каждое значение сверено со скомпилированным index-*.css прода:
 *   p            line-height 1.75, margin 0 0 14px
 *   h1           22 / 600, margin 22 0 10
 *   h2           20 / 600, margin 22 0 10
 *   h3           16 / 600, margin 18 0 8
 *   ul/ol        padding-left 22, line-height 1.75, li margin-bottom 6
 *   li::marker   --ruby-400
 *   strong       600, --text
 *   inline code  bg-3, 1px border, radius 6, padding 1/6, 0.88em
 *   pre          bg-2, 1px border, radius 12, padding 14/16
 *   a            --ruby-400, подчёркивание 1px --ruby-soft
 *   blockquote   левая полоса 3px --ruby-600, отступ 16, --text-2
 *   hr           1px border, отступы 20
 *   table        14px, 1px border, ячейки 8/12, шапка bg-2 вес 600
 */
export function markdownStyles(
  theme: Theme,
  scale: number,
): Record<string, TextStyle | ViewStyle> {
  const body = 15 * scale;

  return {
    body: {
      color: theme.text,
      fontSize: body,
      fontFamily: fontFamilyFor('400'),
      lineHeight: Math.round(body * 1.75),
    },

    paragraph: { marginTop: 0, marginBottom: 14 * scale },

    heading1: {
      fontSize: 22 * scale,
      fontFamily: fontFamilyFor('600'),
      fontWeight: '600',
      color: theme.text,
      marginTop: 22 * scale,
      marginBottom: 10 * scale,
    },
    heading2: {
      fontSize: 20 * scale,
      fontFamily: fontFamilyFor('600'),
      fontWeight: '600',
      color: theme.text,
      marginTop: 22 * scale,
      marginBottom: 10 * scale,
    },
    heading3: {
      fontSize: 16 * scale,
      fontFamily: fontFamilyFor('600'),
      fontWeight: '600',
      color: theme.text,
      marginTop: 18 * scale,
      marginBottom: 8 * scale,
    },

    bullet_list: { marginBottom: 14 * scale, paddingLeft: 22 * scale },
    ordered_list: { marginBottom: 14 * scale, paddingLeft: 22 * scale },
    list_item: { marginBottom: 6 * scale, flexDirection: 'row' },
    // Маркер списка окрашен в ruby400 — как li::marker в вебе.
    bullet_list_icon: { color: ruby.r400, marginRight: 8 },
    ordered_list_icon: { color: ruby.r400, marginRight: 8 },

    strong: { fontFamily: fontFamilyFor('600'), fontWeight: '600', color: theme.text },
    em: { fontStyle: 'italic' },

    code_inline: {
      backgroundColor: theme.bg3,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 1,
      fontSize: body * 0.88,
      color: theme.text,
    },

    code_block: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.button,
      padding: 14,
      color: theme.text,
      fontSize: body * 0.88,
    },
    fence: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.button,
      padding: 14,
      color: theme.text,
      fontSize: body * 0.88,
    },

    link: { color: ruby.r400, textDecorationLine: 'underline' },

    blockquote: {
      backgroundColor: 'transparent',
      borderLeftWidth: 3,
      borderLeftColor: ruby.r600,
      paddingLeft: 16,
      marginLeft: 0,
      color: theme.text2,
    },

    hr: { backgroundColor: theme.border, height: 1, marginVertical: 20 },

    table: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      marginBottom: 14 * scale,
    },
    thead: { backgroundColor: theme.bg2 },
    th: {
      padding: 8,
      paddingHorizontal: 12,
      fontFamily: fontFamilyFor('600'),
      fontWeight: '600',
      color: theme.text,
      fontSize: 14 * scale,
    },
    td: {
      padding: 8,
      paddingHorizontal: 12,
      color: theme.text,
      fontSize: 14 * scale,
    },
    tr: { borderBottomWidth: 1, borderColor: theme.border },
  };
}
