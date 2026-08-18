import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { useFontScale, useTheme } from '../store/settings';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  ruby,
  scaleText,
  shadow,
  size,
  status,
  typography,
} from './tokens';

/**
 * Базовые компоненты на дизайн-токенах (§7.5).
 *
 * Ни одного hex-литерала: всё через токены темы (§5.2, проверяется линтером).
 * Ни одной строки интерфейса: тексты приходят пропсами из i18n (§9).
 */

// ---------------------------------------------------------------------------

export type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  testID?: string;
};

/**
 * Основная кнопка. Градиент userBubble требует expo-linear-gradient, которого
 * на этапе 1 ещё нет, поэтому пока сплошная заливка ruby600 — верхний цвет
 * того же градиента. Замена на градиент не затронет вызывающий код.
 */
export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const scale = useFontScale();
  const inactive = disabled || loading;

  const background =
    variant === 'ghost' ? 'transparent' : inactive ? theme.bg4 : ruby.r600;
  const color =
    variant === 'ghost' ? ruby.r400 : inactive ? theme.text3 : theme.textOnRuby;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed && !inactive ? 0.9 : 1 },
        variant === 'primary' && !inactive ? shadow(theme.shadowGlow) : null,
      ]}
    >
      {loading ? (
        /**
         * Логотип вместо системного спиннера: ожидание входа и регистрации
         * длится секунды, и всё это время экран обязан показывать, что
         * работает именно приложение. Размер равен высоте строки кнопки,
         * поэтому кнопка не прыгает при переключении.
         */
        <Logo animated width={size.buttonSpinner} />
      ) : (
        <Text
          style={[scaleText(typography.newChatButton, scale), { color }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

export type FieldProps = TextInputProps & {
  label: string;
  /** Готовый текст ошибки. Показывается ПОД полем, а не алертом (§8.2). */
  error?: string;
  /** Кнопка показа пароля (§8.2). */
  onToggleSecure?: () => void;
  toggleSecureLabel?: string;
};

export function Field({
  label,
  error,
  onToggleSecure,
  toggleSecureLabel,
  style,
  ...inputProps
}: FieldProps) {
  const theme = useTheme();
  const scale = useFontScale();

  return (
    <View style={styles.field}>
      <Text
        style={[scaleText(typography.caption, scale), { color: theme.text2 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {label}
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          {...inputProps}
          style={[
            styles.input,
            scaleText(typography.composer, scale),
            {
              backgroundColor: theme.bg2,
              borderColor: error ? status.error.border : theme.borderStrong,
              color: theme.text,
            },
            style,
          ]}
          placeholderTextColor={theme.text3}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        />

        {onToggleSecure && toggleSecureLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={onToggleSecure}
            style={styles.secureToggle}
            hitSlop={12}
          >
            <Text
              style={[scaleText(typography.caption, scale), { color: ruby.r400 }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {toggleSecureLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          style={[scaleText(typography.caption, scale), { color: status.error.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

/** Текстовая ссылка-действие: «Забыли пароль?», «Нет аккаунта?». */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useFontScale();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={styles.link}>
      <Text
        style={[scaleText(typography.caption, scale), { color: ruby.r400 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Чекбокс с произвольной подписью справа.
 *
 * Подпись — children, а не строка: в согласии с документами внутри
 * предложения стоят ссылки (§8.1), и плоский текст их не передаст.
 *
 * Нажимается вся строка целиком, а не квадратик 20×20: попасть пальцем в
 * такой квадрат на телефоне трудно, а §7.3 требует цель не меньше 44pt.
 * Поэтому hitSlop и минимальная высота — на всей области.
 */
export function Checkbox({
  checked,
  onToggle,
  error,
  testID,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  /** Подсветить рамку: согласие обязательно, а его не дали. */
  error?: boolean;
  testID?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      testID={testID}
      hitSlop={8}
      style={styles.checkboxRow}
    >
      <View
        style={[
          styles.checkboxBox,
          {
            backgroundColor: checked ? ruby.r600 : 'transparent',
            borderColor: error && !checked ? status.error.border : checked ? ruby.r600 : theme.borderStrong,
          },
        ]}
      >
        {checked ? <Icon name="check" size={14} color={theme.textOnRuby} /> : null}
      </View>
      <View style={styles.checkboxLabel}>{children}</View>
    </Pressable>
  );
}

/** Плашка ошибки уровня формы — когда ошибка не привязана к полю. */
export function ErrorBanner({ message }: { message: string }) {
  const scale = useFontScale();
  return (
    <View style={[styles.banner, { backgroundColor: status.error.bg, borderColor: status.error.border }]}>
      <Text
        style={[scaleText(typography.caption, scale), { color: status.error.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: size.newChatButtonHeight,
    minHeight: size.minTouchTarget, // требование Apple HIG (§7.3)
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  field: { gap: 6 },
  inputRow: { justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: size.minTouchTarget,
  },
  secureToggle: { position: 'absolute', right: 12 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: size.minTouchTarget, // §7.3
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: { flex: 1 },
  link: { paddingVertical: 6 },
  banner: { borderWidth: 1, borderRadius: radius.card, padding: 12 },
});
