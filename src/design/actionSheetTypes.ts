/**
 * Тип пункта листа действий — отдельным .ts от самого компонента.
 *
 * Причина та же, что и у store/settingsTypes.ts: быстрый набор тестов на
 * node:test компилируется без JSX, а useMessageMenu (обычный .ts) ссылается на
 * этот тип. Импорт из .tsx ронял бы сборку набора на «--jsx is not set».
 */
export type SheetAction = {
  label: string;
  onPress: () => void;
  /** Разрушающее действие — рубиновым (жалоба, удаление). */
  destructive?: boolean;
};
