import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  MAX_FONT_SIZE_MULTIPLIER,
  gradients,
  radius,
  ruby,
  scaleText,
  shadow,
  size,
  status as statusTokens,
  typography,
} from '../../design/tokens';
import { Icon } from '../../design/Icon';
import type { IconName } from '../../design/iconPaths';
import { ActionSheet } from '../../design/ActionSheet';
import { Logo } from '../../design/Logo';
import type { ChatRow } from '../../db/schema';
import { useAuthStore } from '../auth/authStore';
import { useChatStore } from '../chat/chatStore';
import { useFontScale, useTheme } from '../../store/settings';
import { groupByDate, type HistoryGroupKey } from './grouping';
import { useChats, useDeleteChat, useRenameChat } from './useChats';

/**
 * Drawer со списком диалогов (§8.4). Сверху вниз:
 * логотип → «Чати нав» → поиск → список по датам → помощь → подвал.
 *
 * Список читается из локальной SQLite, поэтому открывается без сети.
 */

type Row =
  | { kind: 'header'; key: HistoryGroupKey }
  | { kind: 'chat'; chat: ChatRow };

export default function ChatListDrawer({
  onOpenChat,
  onNewChat,
  onOpenSettings,
  onHelp,
}: {
  onOpenChat: (chatId: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();

  /**
   * Строка поиска — локальное состояние экрана, а не серверное: она не
   * приходит с сервера и не кэшируется. В TanStack Query она попадает только
   * как часть ключа запроса (§4.2 отдаёт Query серверное состояние, Zustand —
   * локальное).
   */
  const [query, setQuery] = useState('');

  const { data: chats = [] } = useChats(query);
  const rename = useRenameChat();
  const remove = useDeleteChat();

  const activeChatId = useChatStore((s) => s.chatId);
  const resetChat = useChatStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);

  // Плоский список с заголовками секций: FlashList работает с одним массивом,
  // а SectionList из RN заметно медленнее на длинной истории (§12).
  const rows: Row[] = [];
  for (const section of groupByDate(chats, (c) => c.updated_at)) {
    rows.push({ kind: 'header', key: section.key });
    for (const chat of section.items) rows.push({ kind: 'chat', chat });
  }

  const confirmDelete = useCallback(
    (chat: ChatRow) => {
      Alert.alert(t('history.confirmDelete'), chat.title, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            // Удалённый чат не должен остаться открытым на экране — иначе
            // следующий вопрос уйдёт в чат, которого уже нет (404).
            if (chat.id === activeChatId) resetChat();
            remove.mutate(chat.id);
          },
        },
      ]);
    },
    [activeChatId, remove, resetChat, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <Text
            style={[scaleText(typography.cardCategory, scale), styles.section, { color: ruby.r300 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t(item.key)}
          </Text>
        );
      }

      return (
        <ChatRowItem
          chat={item.chat}
          active={item.chat.id === activeChatId}
          onPress={() => onOpenChat(item.chat.id)}
          onDelete={() => confirmDelete(item.chat)}
          onRename={(title) => rename.mutate({ chatId: item.chat.id, title })}
        />
      );
    },
    [activeChatId, confirmDelete, onOpenChat, rename, scale, t],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.bg1, paddingTop: insets.top + 12 }]}>
      {/*
        1. Логотип «zehn» + название. Здесь он статичный: значок висит в шапке
        постоянно, и вертящийся над списком диалогов только отвлекал бы.
      */}
      <View style={styles.brand}>
        <Logo width={size.logoDrawer} />
        <View>
          <Text style={[scaleText(typography.modalTitle, scale), { color: theme.text }]}>
            {'zehn'}
          </Text>
          <Text
            style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {'Soro'}
          </Text>
        </View>
      </View>

      {/* 2. «Чати нав» — рубиновый градиент. */}
      <Pressable accessibilityRole="button" onPress={onNewChat} testID="drawer-new-chat">
        <LinearGradient
          colors={gradients.pillRuby.colors}
          start={gradients.pillRuby.start}
          end={gradients.pillRuby.end}
          style={[styles.newChat, shadow(theme.shadowGlow)]}
        >
          <Text
            style={[scaleText(typography.newChatButton, scale), { color: theme.textOnRuby }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('common.newChat')}
          </Text>
        </LinearGradient>
      </Pressable>

      {/* 3. Поиск по заголовкам и тексту сообщений — по локальной базе. */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('common.search')}
        placeholderTextColor={theme.text3}
        style={[
          styles.search,
          scaleText(typography.cardText, scale),
          { color: theme.text, backgroundColor: theme.bg2, borderColor: theme.border },
        ]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        testID="drawer-search"
      />

      {/*
        4. Список, сгруппированный по датам.

        Обёртка с flex: 1 обязательна. Список растягивается сам, а текст
        пустого состояния занимает только свою высоту — без обёртки помощь и
        подвал с аккаунтом поднимались к самому поиску, стоило истории
        опустеть. Теперь обе ветки занимают всё свободное место одинаково.
      */}
      <View style={styles.list}>
        {rows.length === 0 ? (
          <Text
            style={[scaleText(typography.cardText, scale), styles.empty, { color: theme.text3 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('history.emptyChats')}
          </Text>
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(row) => (row.kind === 'header' ? row.key : row.chat.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* 5. Помощь и вопросы. */}
      <Pressable accessibilityRole="button" onPress={onHelp} style={styles.footerRow}>
        <Text
          style={[scaleText(typography.cardText, scale), { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('settings.help')}
        </Text>
      </Pressable>

      {/* 6. Подвал: аватар, имя, почта, настройки. */}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={[styles.footer, { borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}
        testID="drawer-settings"
      >
        <View style={[styles.avatar, { backgroundColor: theme.bg3, borderColor: theme.border }]}>
          <Text style={[scaleText(typography.caption, scale), { color: ruby.r400 }]}>
            {initialOf(user?.fullname ?? user?.email ?? '')}
          </Text>
        </View>

        <View style={styles.footerText}>
          <Text
            numberOfLines={1}
            style={[scaleText(typography.cardText, scale), { color: theme.text }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {user?.fullname ?? ''}
          </Text>
          <Text
            numberOfLines={1}
            style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {user?.email ?? ''}
          </Text>
        </View>

        <Icon name="settings" color={theme.text2} />
      </Pressable>
    </View>
  );
}

/** Первая буква имени для аватара. Пустая строка — не повод падать. */
function initialOf(value: string): string {
  return value.trim().slice(0, 1).toLocaleUpperCase('ru');
}

/**
 * Строка чата. Свайп влево — удалить (с подтверждением), вправо —
 * переименовать (§8.4). Активный чат подсвечен градиентом и левой
 * полосой 2px ruby500.
 */
function ChatRowItem({
  chat,
  active,
  onPress,
  onDelete,
  onRename,
}: {
  chat: ChatRow;
  active: boolean;
  onPress: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const startRename = () => {
    setDraft(chat.title);
    setEditing(true);
  };

  const submitRename = () => {
    setEditing(false);
    if (draft.trim() !== chat.title) onRename(draft);
  };

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={submitRename}
        onSubmitEditing={submitRename}
        autoFocus
        style={[
          styles.row,
          scaleText(typography.chatRow, scale),
          { color: theme.text, backgroundColor: theme.bg3 },
        ]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        testID={`chat-rename-${chat.id}`}
      />
    );
  }

  const label = (
    <Text
      numberOfLines={1}
      style={[scaleText(typography.chatRow, scale), { color: active ? theme.text : theme.text2 }]}
      maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
    >
      {chat.title}
    </Text>
  );

  return (
    <Swipeable
      friction={2}
      // Свайп влево открывает «удалить», вправо — «переименовать» (§8.4).
      renderRightActions={() => (
        <SwipeAction
          icon="trash"
          label={t('common.delete')}
          color={statusTokens.danger}
          onPress={onDelete}
          testID={`chat-delete-${chat.id}`}
        />
      )}
      renderLeftActions={() => (
        <SwipeAction
          icon="pencil"
          label={t('common.rename')}
          color={ruby.r400}
          onPress={startRename}
        />
      )}
    >
      <ActionSheet
        visible={menuOpen}
        title={chat.title}
        actions={[
          { label: t('common.rename'), onPress: startRename },
          { label: t('common.delete'), destructive: true, onPress: onDelete },
        ]}
        onClose={() => setMenuOpen(false)}
      />

      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        /**
         * Долгий тап — второй путь к переименованию и удалению (§8.4).
         *
         * Он здесь не для удобства, а потому что на Android свайпа по строке
         * не хватает: у открытого drawer свой жест закрытия на всю ширину, и
         * он перехватывает горизонтальное движение раньше Swipeable. Проверено
         * на устройстве — вместо кнопок «Нест кардан»/«Номро иваз кардан»
         * закрывался сам drawer, то есть добраться до них было нельзя.
         */
        onLongPress={() => setMenuOpen(true)}
        delayLongPress={400}
        testID={`chat-row-${chat.id}`}
      >
        {active ? (
          <LinearGradient
            colors={gradients.rowActive.colors}
            start={gradients.rowActive.start}
            end={gradients.rowActive.end}
            style={[styles.row, styles.activeRow]}
          >
            {label}
          </LinearGradient>
        ) : (
          <View style={styles.row}>{label}</View>
        )}
      </Pressable>
    </Swipeable>
  );
}

function SwipeAction({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  const scale = useFontScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.swipeAction}
      testID={testID}
    >
      <Icon name={icon} color={color} />
      {/* Подпись рядом с иконкой: одна иконка при свайпе читается неоднозначно,
          а действие удаления необратимо. */}
      <Text
        style={[scaleText(typography.caption, scale), { color }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, gap: 10 },
  brand: { paddingHorizontal: 8, gap: 10, flexDirection: 'row', alignItems: 'center' },
  newChat: {
    borderRadius: radius.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  search: {
    borderWidth: 1,
    borderRadius: radius.row,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  // Занимает всё между поиском и подвалом — и со списком, и без него.
  list: { flex: 1 },
  listContent: { paddingBottom: 12 },
  section: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 8 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.row,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Левая полоса 2px ruby500 у активного чата (§8.4).
  activeRow: { borderLeftWidth: 2, borderLeftColor: ruby.r500 },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 4,
  },
  empty: { paddingHorizontal: 8, paddingVertical: 24 },
  footerRow: { paddingVertical: 12, paddingHorizontal: 12, minHeight: 44 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  avatar: {
    width: size.assistantAvatar,
    height: size.assistantAvatar,
    borderRadius: size.assistantAvatar / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: { flex: 1 },
});
