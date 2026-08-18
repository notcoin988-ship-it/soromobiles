import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import {
  MAX_FONT_SIZE_MULTIPLIER,
  gradients,
  radius,
  ruby,
  scaleText,
  shadow,
  size,
  typography,
} from '../../design/tokens';
import { Icon } from '../../design/Icon';
import { Logo } from '../../design/Logo';
import { useFontScale, useTheme } from '../../store/settings';
import { useChatStore, type ChatMessage, type LimitInfo } from './chatStore';
import { MarkdownWithMath } from './MarkdownWithMath';
import { ShimmerText } from './ShimmerText';
import { useMessageMenu } from './useMessageMenu';
import { MessageActions } from './MessageActions';
import { MessageSheets } from './MessageSheets';

/**
 * Компоненты ленты сообщений (§7.5, §8.3).
 * Все значения — из живого CSS sorollm.tj.
 */

/**
 * Пузырь пользователя: градиент 135deg #E5103F → #BE0A33, белый текст 15.5/1.55,
 * паддинг 12/18, радиус 20/20/6/20, максимальная ширина 82%, тень shadowGlow.
 */
export const UserBubble = memo(function UserBubble({
  content,
  queued,
}: {
  content: string;
  /** Сообщение ещё в очереди отправки (§5.5, §8.7). */
  queued?: boolean;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();

  return (
    <View style={styles.userRow}>
      <LinearGradient
        colors={gradients.userBubble.colors}
        start={gradients.userBubble.start}
        end={gradients.userBubble.end}
        // Полупрозрачность — сигнал «ещё не доставлено», понятный без чтения
        // подписи; сама подпись под пузырём объясняет причину (§8.7).
        style={[styles.userBubble, shadow(theme.shadowGlow), queued ? styles.queued : null]}
      >
        <Text
          style={[scaleText(typography.userMessage, scale), { color: theme.textOnRuby }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {content}
        </Text>
      </LinearGradient>

      {queued ? (
        <View style={styles.queuedLabel}>
          {/* Часы из набора, а не эмодзи ⏱: эмодзи рисуется системным шрифтом
              и на каждом Android выглядит по-своему. */}
          <Icon name="clock" size={size.queuedIcon} color={theme.text3} />
          <Text
            style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('errors.queued')}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * Ответ ассистента: без пузыря, слева аватар 34, справа markdown (§7.5).
 *
 * Во время стриминга рендерится СЫРОЙ текст, а полный markdown-парсинг
 * происходит только по событию done (§12): парсить markdown на каждый батч
 * токенов — верный способ положить Redmi 9A.
 */
export const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();
  const regenerate = useChatStore((s) => s.regenerate);
  const menu = useMessageMenu({ messageId: message.id, content: message.content });
  const { openMenu } = menu;

  return (
    <View style={styles.assistantRow}>
      {/*
        Аватар ассистента 34 (§7.5) — тот же знак zehn, что и в шапке.

        Знак живёт РОВНО столько, сколько идёт генерация: он и есть индикатор
        работы, и крутится всё это время. Отдельного спиннера в ленте нет
        намеренно — движение в одном месте читается как «думает», а два
        вертящихся элемента рядом читаются как зависание.

        Готовый ответ остаётся БЕЗ знака — он исчезает вместе со строкой
        «Фикр дорам…», по той же причине: индикатор, который никуда не делся
        после завершения, продолжает намекать на работу, которой уже нет.
        Заодно лента перестаёт быть колонкой из повторяющихся одинаковых
        аватаров, где каждый занимает 34 точки высоты впустую.
      */}
      {message.streaming ? (
        <View style={[styles.avatar, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
          <Logo width={size.assistantAvatarGlyph} animated />
        </View>
      ) : null}

      <View style={styles.assistantContent}>
        {message.content.length === 0 && message.streaming ? (
          /*
            Индикатор генерации: «Фикр дорам…» (§7.5). Три точки запрещены,
            а сам текст мерцает — тот же эффект .shimmer-text, что на проде.
          */
          <ShimmerText
            text={t('chat.thinking')}
            style={scaleText(typography.assistantBody, scale)}
            width={size.shimmerWidth}
          />
        ) : message.streaming ? (
          <Text
            style={[scaleText(typography.assistantBody, scale), { color: theme.text }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {message.content}
          </Text>
        ) : (
          <>
            {/*
              Долгий тап по тексту ответа открывает контекстное меню (§8.3).
              Обёрнут именно текст, а не весь блок: внутри ряда действий свои
              кнопки, и общий Pressable перехватывал бы их нажатия.
            */}
            <Pressable
              onLongPress={openMenu}
              delayLongPress={400}
              // Признак завершённого ответа для E2E: по нему сценарий
              // понимает, что генерация закончилась (§14).
              testID={`message-longpress-${message.id}`}
            >
              <MarkdownWithMath content={message.content} />
            </Pressable>

            {/* Меню долгого тапа и выбор категории жалобы (§8.3). */}
            <MessageSheets menu={menu} />

            {/* Ряд действий только под ЗАВЕРШЁННЫМ ответом (§7.5). */}
            <MessageActions
              messageId={message.id}
              content={message.content}
              onRegenerate={() => void regenerate(message.id)}
            />
          </>
        )}
      </View>
    </View>
  );
});

/**
 * Плашка исчерпанного лимита (§8.6). Постоянная — не тост и не алерт,
 * остаётся в переписке при повторном открытии чата.
 */
export function LimitNotice({ limit }: { limit: LimitInfo }) {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();

  return (
    <LinearGradient
      colors={gradients.limitNotice.colors}
      start={gradients.limitNotice.start}
      end={gradients.limitNotice.end}
      style={styles.limitNotice}
    >
      <Text
        style={[scaleText(typography.modalTitle, scale), { color: theme.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {t('errors.limitReached')}
      </Text>

      {/* Текст с сервера уже локализован на таджикском (§6.5). */}
      {limit.message ? (
        <Text
          style={[scaleText(typography.cardText, scale), { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {limit.message}
        </Text>
      ) : null}

      {limit.resetsInHours !== null ? (
        <Text
          style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('errors.limitResets', {
            hours: limit.resetsInHours,
            time: limit.resetsAtLocal ?? '',
          })}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

/** Карточка-подсказка (§7.5): категория капсом ruby300 + текст вопроса. */
export function SuggestionCard({
  category,
  text,
  onPress,
}: {
  category: string;
  text: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useFontScale();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.bg3 : theme.bg2,
          borderColor: theme.border,
        },
      ]}
    >
      <Text
        style={[scaleText(typography.cardCategory, scale), { color: ruby.r300 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {category}
      </Text>
      <Text
        style={[scaleText(typography.cardText, scale), { color: theme.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', gap: 4 },
  queued: { opacity: 0.6 },
  queuedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 },
  userBubble: {
    maxWidth: '82%',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderTopLeftRadius: radius.userBubble.topLeft,
    borderTopRightRadius: radius.userBubble.topRight,
    borderBottomRightRadius: radius.userBubble.bottomRight,
    borderBottomLeftRadius: radius.userBubble.bottomLeft,
  },
  /**
   * Аватар НАД ответом, а не слева от него.
   *
   * Раньше это был ряд: аватар 34 px плюс отступ 10 забирали колонку, и текст
   * ответа начинался на 44 px правее края экрана. На узком телефоне это
   * заметно: таблица упиралась в правый край, а строки рвались по два-три
   * слова. В ChatGPT, на который равняемся, ответ идёт во всю ширину.
   *
   * Сам аватар остаётся (§7.5): знак крутится, пока идёт генерация, и это
   * единственный индикатор работы в ленте.
   */
  assistantRow: { gap: 8 },
  avatar: {
    width: size.assistantAvatar,
    height: size.assistantAvatar,
    borderRadius: size.assistantAvatar / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantContent: { flex: 1 },
  limitNotice: {
    borderWidth: 1,
    borderColor: 'rgba(229,16,63,0.28)',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
});
