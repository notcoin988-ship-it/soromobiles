import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { ChatDrawerParams } from '../navigation/RootNavigator';

import { isConnected, onReconnect } from '../api/network';
import { useSuggestions } from '../store/config';
import { Facets } from '../design/Facets';
import { GlowField } from '../design/GlowField';
import { Icon } from '../design/Icon';
import type { IconName } from '../design/iconPaths';
import { Logo } from '../design/Logo';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  gradients,
  radius,
  scaleText,
  shadow,
  size,
  status as statusTokens,
  typography,
} from '../design/tokens';
import {
  AssistantMessage,
  LimitNotice,
  SuggestionCard,
  UserBubble,
} from '../features/chat/components';
import { useChatStore, type ChatMessage } from '../features/chat/chatStore';
import { useChats } from '../features/history/useChats';
import { useAuthStore } from '../features/auth/authStore';
import { useOnboardingStore } from '../store/onboarding';
import { useFontScale, useSettingsStore, useTheme, useThemeName } from '../store/settings';

/**
 * Экран чата — ядро продукта (§8.3).
 *
 * Пустое состояние: логотип → приветствие → подзаголовок → поле ввода →
 * дисклеймер → карточки-подсказки вертикальным стеком (на телефоне в один
 * столбец, §7.4).
 */
export default function ChatScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();

  const user = useAuthStore((s) => s.user);
  /**
   * В приветствии — имя с экрана первого запуска, а не из аккаунта Google.
   * Человек назвал его сам; строка из профиля Google бывает рабочим ФИО или
   * латиницей и на «Салом, …» ложится плохо. Если имени нет (аккаунт заведён
   * до появления экрана), падаем обратно на первое слово из профиля.
   */
  const preferredName = useOnboardingStore((s) => s.name);
  const suggestions = useSuggestions();
  const messages = useChatStore((s) => s.messages);
  const generating = useChatStore((s) => s.generating);
  const limit = useChatStore((s) => s.limit);
  const errorKey = useChatStore((s) => s.errorKey);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);

  // §7.4: планшетная раскладка от 768 pt. useWindowDimensions, а не
  // Dimensions.get: на планшете экран поворачивают, и порог пересекается на лету.
  const { width } = useWindowDimensions();
  const isTablet = width >= size.tabletBreakpoint;

  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState(0);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  // Автоскролл отключается, если пользователь ушёл вверх (§8.3).
  const stickToBottom = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  /** Высота нижнего блока — над ним висит кнопка «вниз». */
  const [dockHeight, setDockHeight] = useState(0);

  const isEmpty = messages.length === 0;
  // Поле ввода блокируется до сброса лимита (§8.6).
  const blocked = limit !== null;

  useEffect(() => {
    if (stickToBottom.current && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? draft).trim();
      if (!value || blocked) return;
      setDraft('');
      stickToBottom.current = true;
      void send(value);
    },
    [draft, blocked, send],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) =>
      item.role === 'user' ? (
        <UserBubble content={item.content} queued={item.queued} />
      ) : (
        <AssistantMessage message={item} />
      ),
    [],
  );

  const composer = (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: theme.bg2,
          borderColor: theme.borderStrong,
        },
        // Тень shadowLg на экране пустого состояния и shadowMd в активном чате (§7.5).
        shadow(isEmpty ? theme.shadowLg : theme.shadowMd),
      ]}
    >
      <TextInput
        value={draft}
        onChangeText={setDraft}
        editable={!blocked}
        placeholder={t('chat.placeholder')}
        placeholderTextColor={theme.text3}
        multiline
        // Автоувеличение высоты до 220, дальше — внутренний скролл (§7.3).
        onContentSizeChange={(e) =>
          setComposerHeight(Math.min(e.nativeEvent.contentSize.height, size.composerMaxHeight))
        }
        style={[
          styles.input,
          scaleText(typography.composer, scale),
          { color: theme.text, height: Math.max(40, composerHeight) },
        ]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        testID="chat-input"
      />

      <View style={styles.composerActions}>
        <SendButton
          generating={generating}
          disabled={blocked || (!draft.trim() && !generating)}
          onPress={() => (generating ? stop() : submit())}
        />
      </View>
    </View>
  );

  const disclaimer = (
    <Text
      style={[scaleText(typography.disclaimer, scale), styles.disclaimer, { color: theme.text3 }]}
      maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
    >
      {t('chat.disclaimer')}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg0, paddingTop: insets.top }]}
      /**
       * На Android — 'height', а не отключено.
       *
       * §7.4 требует, чтобы поле ввода прилипало к клавиатуре. Без behavior
       * окно не сжимается: в пустом чате это незаметно (содержимое короткое),
       * а в активном лента занимает всю высоту, и композер уезжает ПОД
       * клавиатуру — человек не видит, что печатает. Поймано на эмуляторе.
       */
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/*
        Свечение — фон ВСЕГО экрана чата, а не только пустого состояния.
        На проде `.glow-field` висит на оболочке приложения и видно его всегда,
        в том числе под перепиской; у нас же оно раньше стояло внутри ветки
        `isEmpty`, и стоило задать первый вопрос, как фон становился плоским
        чёрным прямоугольником. Слой абсолютный и не ловит касания, поэтому
        достаточно поднять его на уровень корня — первым, чтобы лежать под
        шапкой, лентой и композером.
      */}
      <GlowField />

      {/* Сетка граней — поверх свечения, под содержимым (§7.1). */}
      <Facets />

      <TopBar />

      {/* §8.3: «Индикатор офлайна — полоса под шапкой». Иконка часов на
          сообщениях в очереди уже есть, но она видна только рядом с ними. */}
      <OfflineBar />

      {isEmpty ? (
        <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled">
          {/*
            §7.5, порядок пустого состояния: логотип → приветствие → подзаголовок.

            Здесь логотип СТАТИЧНЫЙ. Пока человек набирает вопрос, приложение
            ничего не делает, и вертящийся значок сообщал бы неправду; вдобавок
            движение рядом с полем ввода мешает читать собственный текст.
            Анимация включается там, где идёт работа: на аватаре ответа и на
            экране восстановления сессии.
          */}
          <Logo style={styles.logo} />

          <Text
            style={[scaleText(typography.greeting, scale), { color: theme.text }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('chat.greeting', { name: preferredName ?? user?.fullname?.split(' ')[0] ?? '' })}
          </Text>
          <Text
            style={[scaleText(typography.subgreeting, scale), { color: theme.text2 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('chat.subgreeting')}
          </Text>

          {composer}
          {disclaimer}

          {/*
            Тексты карточек приходят с сервера (/v1/config, §7.5), а не зашиты
            в билд: их меняют без релиза в магазин.

            §7.4: на телефоне карточки идут вертикальным стеком в один
            столбец, на планшете (≥ 768 pt) — сеткой 2×2, как на вебе. Веб
            рисует 2×2 всегда, даже на 360 px, но ТЗ здесь отходит от него
            намеренно: два столбца по 151 px на телефоне нечитаемы.
          */}
          <View style={[styles.cards, isTablet ? styles.cardsGrid : null]}>
            {suggestions.map((s) => (
              <View key={s.text} style={isTablet ? styles.cardCell : null}>
                <SuggestionCard
                  category={s.cat}
                  text={s.text}
                  // Тап подставляет вопрос в поле и сразу отправляет (§7.5).
                  onPress={() => submit(s.text)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          {/*
            §12 требует FlashList, а не ScrollView или FlatList: на ленте из
            200 сообщений разница видна на Redmi 9A.

            ОТКЛОНЕНИЕ ОТ БУКВЫ ТЗ: §12 говорит «FlashList с estimatedItemSize».
            В FlashList v2 этого пропа больше нет — список измеряет элементы
            сам, и передача estimatedItemSize стала ошибкой типов. Следуем сути
            требования, а не названию удалённого пропа.
          */}
          <FlashList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onScrollBeginDrag={() => {
              stickToBottom.current = false;
              setShowScrollDown(true);
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              // 40 точек допуска: попасть ровно в конец пальцем невозможно, а
              // без допуска кнопка «вниз» мигала бы у самого низа ленты.
              const atBottom =
                contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
              stickToBottom.current = atBottom;
              setShowScrollDown(!atBottom);
            }}
            scrollEventThrottle={64}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={limit ? <LimitNotice limit={limit} /> : null}
          />

          {/*
            §8.3: «Автоскролл к низу при новых токенах; отключается, если
            пользователь проскроллил вверх, С ПЛАВАЮЩЕЙ КНОПКОЙ „вниз“».
            Без неё уход вверх во время генерации — ловушка: лента продолжает
            расти, а вернуться к концу можно только долгой прокруткой.
          */}
          {showScrollDown ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.newChat')}
              onPress={() => {
                stickToBottom.current = true;
                setShowScrollDown(false);
                listRef.current?.scrollToEnd({ animated: true });
              }}
              style={[
                styles.scrollDown,
                { backgroundColor: theme.bg3, borderColor: theme.border, bottom: dockHeight + 12 },
                shadow(theme.shadowMd),
              ]}
              testID="chat-scroll-down"
            >
              <Icon name="chevDown" color={theme.text} />
            </Pressable>
          ) : null}

          {errorKey ? (
            <Text
              style={[scaleText(typography.caption, scale), styles.error, { color: theme.text3 }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {t(errorKey)}
            </Text>
          ) : null}

          {/*
            В активном чате внизу только поле ввода.

            Дисклеймер «Soro метавонад хато кунад» остаётся на пустом экране,
            где человек читает его до первого вопроса (§7.5). В переписке он
            повторялся под каждым экраном, отжимал поле ввода от нижнего края
            и ничего нового не сообщал.
          */}
          <View
            style={[styles.composerDock, { paddingBottom: insets.bottom + 8 }]}
            onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
          >
            {composer}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Полоса «нет интернета» под шапкой (§8.3, §8.7).
 *
 * Подписка на сеть здесь своя и локальная: сетевой слой отдаёт состояние
 * синхронно (isConnected), но не умеет уведомлять React о переходе в офлайн —
 * только о восстановлении. Проверять на каждом рендере нельзя, поэтому
 * состояние снимается по таймеру раз в две секунды: полоса не критична ко
 * времени, а лишняя подписка на NetInfo стоила бы дороже.
 */
function OfflineBar() {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!isConnected());

  useEffect(() => {
    const timer = setInterval(() => setOffline(!isConnected()), 2000);
    const stop = onReconnect(() => setOffline(false));
    return () => {
      clearInterval(timer);
      stop();
    };
  }, []);

  if (!offline) return null;

  return (
    // Фон — bg3, а не заливка предупреждающим цветом: полоса висит постоянно,
    // пока нет сети, и яркая плашка через весь экран быстро надоедает.
    <View style={[styles.offlineBar, { backgroundColor: theme.bg3 }]}>
      <Icon name="clock" size={size.queuedIcon} color={statusTokens.warning} />
      <Text
        style={[scaleText(typography.caption, scale), { color: statusTokens.warning }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {t('errors.offline')}
      </Text>
    </View>
  );
}

/**
 * Верхняя панель (§7.4): слева меню, по центру название чата, справа новый чат.
 * Высота 56, кнопки 38×38 (§7.3).
 *
 * Кнопка меню открывает drawer со списком диалогов (§8.4); настройки — в его
 * подвале, поэтому удаление аккаунта укладывается в три тапа
 * (Guideline 5.1.1(v)): меню → настройки → удалить.
 */
function TopBar() {
  const theme = useTheme();
  const scale = useFontScale();
  const navigation = useNavigation<DrawerNavigationProp<ChatDrawerParams>>();
  const chatId = useChatStore((s) => s.chatId);
  const reset = useChatStore((s) => s.reset);
  const { data: chats = [] } = useChats('');
  const { t } = useTranslation();

  // Заголовок берём из локальной базы: он же показан в drawer, и после
  // переименования свайпом шапка меняется вместе со списком.
  const title = chats.find((c) => c.id === chatId)?.title ?? '';

  return (
    <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
      <TopButton
        icon="sidebar"
        onPress={() => navigation.openDrawer()}
        accessibilityLabel={t('common.search')}
        testID="chat-menu"
      />

      <Text
        numberOfLines={1}
        style={[scaleText(typography.chatRow, scale), styles.topTitle, { color: theme.text2 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {title}
      </Text>

      <TopButton icon="edit" onPress={reset} accessibilityLabel={t('common.newChat')} />
      <ThemeToggle />
    </View>
  );
}

/**
 * Переключатель темы в шапке (§7.4: «справа новый чат и переключатель темы»).
 *
 * Переключает между тёмной и светлой напрямую, минуя «системную»: это
 * быстрая кнопка, а не настройка. Полный выбор из трёх вариантов остаётся
 * в настройках (§8.5).
 */
function ThemeToggle() {
  const themeName = useThemeName();
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const { t } = useTranslation();

  const next = themeName === 'dark' ? 'light' : 'dark';

  return (
    <TopButton
      // Показываем иконку той темы, в которую переключимся, а не текущей.
      icon={next === 'light' ? 'sun' : 'moon'}
      onPress={() => setThemePreference(next)}
      accessibilityLabel={t(next === 'light' ? 'settings.themeLight' : 'settings.themeDark')}
    />
  );
}

function TopButton({
  icon,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.topButton,
        { backgroundColor: pressed ? theme.bg3 : 'transparent' },
      ]}
    >
      <Icon name={icon} color={theme.text2} />
    </Pressable>
  );
}

/**
 * Кнопка отправки 38×38, радиус 12 (§7.3).
 * Неактивна (bg4 + text3), пока поле пустое. Во время генерации превращается
 * в кнопку «Стоп» — квадрат (§7.5).
 */
function SendButton({
  generating,
  disabled,
  onPress,
}: {
  generating: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const active = generating || !disabled;

  // Во время генерации кнопка превращается в «Стоп» — залитый квадрат (§7.5).
  const content = (
    <Icon
      name={generating ? 'stop' : 'arrowUp'}
      color={active ? theme.textOnRuby : theme.text3}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled && !generating}
      hitSlop={8}
      testID="chat-send"
    >
      {active ? (
        <LinearGradient
          colors={gradients.userBubble.colors}
          start={gradients.userBubble.start}
          end={gradients.userBubble.end}
          style={[styles.sendButton, shadow(theme.shadowGlow)]}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.sendButton, { backgroundColor: theme.bg4 }]}>{content}</View>
      )}
    </Pressable>
  );
}

/**
 * Чипы класса обучения (§8.3), в порядке ТЗ. null — «не выбран»: он должен
 * быть доступен как явный вариант, иначе снять уровень невозможно.
 */

const styles = StyleSheet.create({
  // overflow: hidden — свечение вынесено за края экрана на 20% (inset: -20% в
  // CSS прода), и без обрезки оно растянуло бы холст.
  root: { flex: 1, overflow: 'hidden' },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  scrollDown: {
    position: 'absolute',
    alignSelf: 'center',
    width: size.topButton,
    height: size.topButton,
    borderRadius: size.topButton / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContent: { padding: 24, gap: 12, flexGrow: 1, justifyContent: 'center' },
  logo: { alignSelf: 'center', marginBottom: 4 },
  /**
   * Горизонтальный отступ 12, а не 24.
   *
   * На экране 1080×2340 прежние 24 pt с каждой стороны съедали заметную долю
   * ширины, и таблица в ответе упиралась в края, а строки рвались по два-три
   * слова. Вертикальные отступы оставлены прежними — сжимать ленту по высоте
   * незачем.
   */
  listContent: { paddingHorizontal: 12, paddingTop: 24, paddingBottom: 40, gap: 28 },
  composerDock: { paddingHorizontal: 24, gap: 6 },
  composer: {
    borderWidth: 1,
    borderRadius: radius.composer,
    padding: 8,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: { flex: 1, paddingTop: 10, paddingBottom: 10, maxHeight: size.composerMaxHeight },
  composerActions: { justifyContent: 'flex-end' },
  sendButton: {
    width: size.sendButton,
    height: size.sendButton,
    borderRadius: radius.send,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimer: { textAlign: 'center', paddingHorizontal: 12 },
  error: { textAlign: 'center', paddingBottom: 4 },
  cards: { gap: 10, marginTop: 8 },
  // Сетка 2×2 на планшете: gap 10 и max-width 760 — как в инлайн-стиле веба.
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: size.contentMaxWidth, alignSelf: 'center' },
  cardCell: { width: '48%' },
  topBar: {
    height: size.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  topButton: {
    width: size.topButton,
    height: size.topButton,
    borderRadius: radius.topButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, textAlign: 'center' },
});
