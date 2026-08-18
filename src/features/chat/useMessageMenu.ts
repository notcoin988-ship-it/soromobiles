import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

import type { SheetAction } from '../../design/actionSheetTypes';

/**
 * Действия над ответом модели.
 *
 * Вынесено в хук, потому что одни и те же действия нужны в двух местах: в
 * ряду кнопок под ответом и в контекстном меню по долгому тапу. Дублировать
 * обработчики нельзя — состояние «скопировано» разошлось бы на первом же
 * нажатии.
 *
 * ОТКЛОНЕНИЕ ОТ §8.3. Здесь были ещё «Объясни проще», оценка 👍/👎 и жалоба
 * с выбором категории — убраны по решению заказчика. Вместе с ними отпали
 * критерий §17 «оценка и жалоба работают» и задача бэкенда B11.
 *
 * Меню показывается своим листом (design/ActionSheet), а НЕ системным Alert:
 * Android рисует в диалоге только три кнопки и молча теряет остальные.
 * Проверено на устройстве; см. комментарий в ActionSheet.
 */
export function useMessageMenu({ content }: { messageId: string; content: string; model?: string | null }) {
  const { t } = useTranslation();

  const [copied, setCopied] = useState(false);

  /** Открыто ли меню ответа. */
  const [sheet, setSheet] = useState<'menu' | null>(null);

  const copy = async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Системный лист «Поделиться» (§8.3). */
  const share = async () => {
    try {
      await Share.share({ message: content });
    } catch {
      // Пользователь закрыл лист — это не ошибка.
    }
  };

  const openMenu = () => setSheet('menu');
  const closeSheet = () => setSheet(null);

  const menuActions = useMemo<SheetAction[]>(
    () => [
      { label: t('common.copy'), onPress: () => void copy() },
      { label: t('common.share'), onPress: () => void share() },
    ],
    [t, content],
  );

  return {
    copy,
    copied,
    share,
    openMenu,
    /** Состояние листа — для компонента, который его рисует. */
    sheet,
    closeSheet,
    menuActions,
  };
}
