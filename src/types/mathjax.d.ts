/**
 * Типы для вендорной копии MathJax внутри react-native-mathjax-svg.
 *
 * Сам пакет типов не поставляет: у него есть index.d.ts только для готового
 * компонента, а мы обращаемся напрямую к модулям mathjax/es5, чтобы не
 * тащить в бандл все расширения TeX (см. features/chat/mathjax.ts).
 *
 * Описано ровно то, что вызывается, а не весь MathJax: полная типизация
 * чужого движка здесь была бы фикцией — сверять её всё равно не с чем.
 */

declare module 'react-native-mathjax-svg/mathjax/es5/js/mathjax.js' {
  export const mathjax: {
    document(
      html: string,
      options: { InputJax: unknown; OutputJax: unknown },
    ): {
      convert(tex: string, options: { display: boolean; em: number; ex: number }): unknown;
    };
  };
}

declare module 'react-native-mathjax-svg/mathjax/es5/js/input/tex.js' {
  export class TeX {
    constructor(options: { packages: string[] });
  }
}

declare module 'react-native-mathjax-svg/mathjax/es5/js/output/svg.js' {
  export class SVG {
    constructor(options: { fontCache: 'local' | 'global' | 'none' });
  }
}

declare module 'react-native-mathjax-svg/mathjax/es5/js/adaptors/liteAdaptor.js' {
  export function liteAdaptor(): { outerHTML(node: unknown): string };
}

declare module 'react-native-mathjax-svg/mathjax/es5/js/handlers/html.js' {
  export function RegisterHTMLHandler(adaptor: unknown): void;
}
