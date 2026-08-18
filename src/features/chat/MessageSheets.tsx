import React from 'react';

import { ActionSheet } from '../../design/ActionSheet';
import type { useMessageMenu } from './useMessageMenu';

/**
 * Лист действий над ответом по долгому тапу.
 *
 * Отдельным компонентом, потому что рисуют его двое — ряд кнопок под ответом и
 * сам текст ответа, — а useMessageMenu у каждого свой экземпляр со своим
 * состоянием. Общий компонент избавляет от двух почти одинаковых копий
 * разметки, которые неизбежно разъехались бы при первой же правке.
 *
 * Второй лист, выбор категории жалобы, убран вместе с самой жалобой.
 */
export function MessageSheets({ menu }: { menu: ReturnType<typeof useMessageMenu> }) {
  return (
    <ActionSheet
      visible={menu.sheet === 'menu'}
      actions={menu.menuActions}
      onClose={menu.closeSheet}
    />
  );
}
