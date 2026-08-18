import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { NavigationContainer, type LinkingOptions, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';

import { ruby, size } from '../design/tokens';
import { useAuthStore } from '../features/auth/authStore';
import { useChatStore } from '../features/chat/chatStore';
import ChatListDrawer from '../features/history/ChatListDrawer';
import { Logo } from '../design/Logo';
import { needsConsent } from '../features/legal/consent';
import { openDocument } from '../features/legal/openDocument';
import { useLinks } from '../store/config';
import ChatScreen from '../screens/ChatScreen';
import DevGlyphsScreen from '../screens/DevGlyphsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChooseLanguageScreen from '../screens/onboarding/ChooseLanguageScreen';
import DisclaimerScreen from '../screens/onboarding/DisclaimerScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import { useOnboardingStore } from '../store/onboarding';
import { useTheme, useThemeName } from '../store/settings';

/**
 * Корневая навигация (§5.1, §8).
 *
 * Экраны переключаются не императивно, а по статусу авторизации: после
 * подтверждения почты человек попадает сразу в чат, а не обратно на вход
 * (§8.2). Это работает само собой, потому что дерево навигации зависит от
 * status в сторе.
 */

export type AuthStackParams = {
  SignIn: undefined;
  SignUp: undefined;
  VerifyEmail: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type AppStackParams = {
  Chat: undefined;
  Settings: undefined;
  DevGlyphs: undefined;
};

export type ChatDrawerParams = {
  ChatRoot: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();
const Drawer = createDrawerNavigator<ChatDrawerParams>();

/** Схема soro:// зарегистрирована в app.config.ts (§5.1, §11). */
const linking: LinkingOptions<AuthStackParams & AppStackParams> = {
  prefixes: ['soro://'],
  config: {
    screens: {
      SignIn: 'signin',
      Chat: 'chat',
    },
  },
};

function AuthFlow() {
  const status = useAuthStore((s) => s.status);

  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      {status === 'pendingVerification' ? (
        <AuthStack.Screen name="VerifyEmail">
          {() => <VerifyEmailScreenHost />}
        </AuthStack.Screen>
      ) : (
        <>
          <AuthStack.Screen name="SignIn">
            {({ navigation }) => (
              <SignInScreen
                onSignUp={() => navigation.navigate('SignUp')}
                onForgotPassword={() => navigation.navigate('ForgotPassword')}
              />
            )}
          </AuthStack.Screen>
          <AuthStack.Screen name="SignUp">
            {({ navigation }) => <SignUpScreen onSignIn={() => navigation.goBack()} />}
          </AuthStack.Screen>
          <AuthStack.Screen name="ForgotPassword">
            {({ navigation }) => (
              <ForgotPasswordScreen
                onSent={() => navigation.navigate('ResetPassword')}
                onBack={() => navigation.popTo('SignIn')}
              />
            )}
          </AuthStack.Screen>
          <AuthStack.Screen name="ResetPassword">
            {({ navigation }) => <ResetPasswordScreen onBack={() => navigation.popTo('SignIn')} />}
          </AuthStack.Screen>
        </>
      )}
    </AuthStack.Navigator>
  );
}

function VerifyEmailScreenHost() {
  const signOut = useAuthStore((s) => s.signOut);
  return <VerifyEmailScreen onBack={() => void signOut()} />;
}

/**
 * Drawer со списком диалогов (§8.4).
 *
 * Он оборачивает ТОЛЬКО экран чата, а не весь стек: иначе настройки, открытые
 * модально, тоже вытягивались бы свайпом от края, и жест конфликтовал бы с
 * возвратом назад. Открывается тапом по иконке меню или свайпом от левого
 * края — это поведение самого navigation-drawer, отдельно его писать не надо.
 */
function ChatWithDrawer() {
  const openChat = useChatStore((s) => s.openChat);
  const resetChat = useChatStore((s) => s.reset);
  const links = useLinks();
  const themeName = useThemeName();

  return (
    <Drawer.Navigator
      screenOptions={{ headerShown: false, drawerType: 'front', drawerStyle: styles.drawer }}
      drawerContent={({ navigation }) => (
        <ChatListDrawer
          onOpenChat={(chatId) => {
            void openChat(chatId);
            navigation.closeDrawer();
          }}
          onNewChat={() => {
            resetChat();
            navigation.closeDrawer();
          }}
          onOpenSettings={() => {
            navigation.closeDrawer();
            navigation.getParent()?.navigate('Settings');
          }}
          // Встроенный браузер, а не Chrome отдельным приложением (§8.1):
          // человек возвращается в чат крестиком, а не через переключатель задач.
          onHelp={() => void openDocument(links.support, themeName)}
        />
      )}
    >
      <Drawer.Screen name="ChatRoot" component={ChatScreen} />
    </Drawer.Navigator>
  );
}

function AppFlow() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Chat" component={ChatWithDrawer} />
      {/*
        Настройки открываются модально: путь до удаления аккаунта получается
        чат → настройки → удалить, то есть в пределах трёх тапов, как требуют
        Apple Guideline 5.1.1(v) и Google (§8.5).
      */}
      <AppStack.Screen name="Settings" options={{ presentation: 'modal' }}>
        {({ navigation }) => <SettingsScreen onClose={() => navigation.goBack()} />}
      </AppStack.Screen>
      <AppStack.Screen name="DevGlyphs" component={DevGlyphsScreen} />
    </AppStack.Navigator>
  );
}

export default function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const theme = useTheme();
  const themeName = useThemeName();

  const languageChosen = useOnboardingStore((s) => s.languageChosen);
  const acceptedDocsVersion = useOnboardingStore((s) => s.acceptedDocsVersion);
  const markLanguageChosen = useOnboardingStore((s) => s.markLanguageChosen);
  const acceptDocs = useOnboardingStore((s) => s.acceptDocs);

  // Долгая сессия (§6.2): при старте пробуем восстановить вход по
  // сохранённому refresh-токену, не спрашивая пароль заново.
  useEffect(() => {
    void restore();
  }, [restore]);

  const navTheme: NavTheme = {
    dark: themeName === 'dark',
    colors: {
      primary: ruby.r600,
      background: theme.bg0,
      card: theme.bg1,
      text: theme.text,
      border: theme.border,
      notification: ruby.r500,
    },
    fonts: {
      // Системный шрифт — как и во всём остальном интерфейсе (см. tokens.ts).
      regular: { fontFamily: '', fontWeight: '400' },
      medium: { fontFamily: '', fontWeight: '500' },
      bold: { fontFamily: '', fontWeight: '700' },
      heavy: { fontFamily: '', fontWeight: '700' },
    },
  };

  /**
   * Первый экран запуска: идёт восстановление сессии по refresh-токену (§6.2).
   *
   * Вместо системного спиннера крутится логотип. Это не украшение: экран
   * появляется до первого кадра продукта, и фирменный знак объясняет, ЧТО
   * загружается, а серое колесо Android — нет.
   */
  if (status === 'unknown') {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg0 }]}>
        <Logo animated width={size.logo} />
      </View>
    );
  }

  /**
   * Первый запуск (§8.1) — ДО авторизации и до чата.
   *
   * Два условия проверяются раздельно. Экран языка показывается только тем,
   * кто не выбирал его ни разу. Дисклеймер — всем, кто не соглашался с
   * действующей редакцией документов, в том числе уже вошедшим: при выпуске
   * новой редакции §8.1 требует показать его повторно, и человек с открытой
   * сессией не исключение.
   *
   * Навигатора здесь нет намеренно: экрана всего два, порядок жёсткий, назад
   * с них некуда. Стек добавил бы анимации и кнопку возврата, которой по §8.1
   * быть не должно.
   */
  if (!languageChosen) {
    return <ChooseLanguageScreen onContinue={markLanguageChosen} />;
  }

  if (needsConsent(acceptedDocsVersion)) {
    return <DisclaimerScreen onAccept={acceptDocs} />;
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      {status === 'signedIn' ? <AppFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  // §7.4: min(86% ширины экрана, 320). Фиксированные 270 из токенов дали бы
  // на маленьком экране почти полное перекрытие, а на большом — узкую полоску.
  drawer: {
    width: Math.min(Dimensions.get('window').width * size.drawerWidthRatio, size.drawerWidthMax),
  },
});
