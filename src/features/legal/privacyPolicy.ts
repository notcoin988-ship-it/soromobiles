import type { Language } from '../../i18n/languages';

/**
 * Политика конфиденциальности SoroLLM — полный текст, вшитый в приложение.
 *
 * ПОЧЕМУ НЕ ССЫЛКА НА САЙТ. §10 требует, чтобы приложение оставалось
 * пригодным без сети, а Apple Guideline 5.1.1 и Google User Data — чтобы
 * политика была доступна ДО создания аккаунта. Ссылка на zehn.ai не даёт ни
 * того, ни другого: в самолёте и на школьном Wi-Fi с фильтрацией браузер
 * откроет пустую страницу ровно в тот момент, когда человек решает, отдавать
 * ли свои данные. Ссылки из /v1/config при этом остаются — они ведут на
 * актуальную редакцию и живут в настройках.
 *
 * ПОЧЕМУ НЕ В i18n/*.json. Словари §9 — это подписи интерфейса, которые
 * переводятся и правятся дизайном. Здесь юридический текст: он меняется
 * целиком, редакцией и с новой датой, и его нельзя «немного поправить под
 * кнопку». Отдельный модуль ещё и не раздувает словари, которые грузятся при
 * каждом старте.
 *
 * ДАТА РЕДАКЦИИ — часть документа, а не интерфейса, поэтому лежит здесь же и
 * не форматируется по локали.
 */

export type LegalBlock =
  | { kind: 'text'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'bullets'; items: string[] };

export type LegalSection = { heading?: string; blocks: LegalBlock[] };

export type LegalDocument = {
  title: string;
  /** Строка вида «Сана: 15 январи соли 2026» — как в самом документе. */
  date: string;
  sections: LegalSection[];
};

// ---------------------------------------------------------------------------
// Таджикский — язык приложения по умолчанию (§9)
// ---------------------------------------------------------------------------

const PRIVACY_POLICY_TG: LegalDocument = {
  title: 'Сиёсати ҳифзи махфият – SoroLLM',
  date: 'Сана: 15 январи соли 2026',
  sections: [
    {
      heading: 'Муқаддима',
      blocks: [
        {
          kind: 'text',
          text: 'Ширкати zehn.ai Ltd («мо», «аз мо» ё «ба мо») ба махфияти шумо эҳтиром мегузорад ва уҳдадор аст, ки маълумоти шахсии шуморо ҳангоми истифодаи барномаи мобилӣ, веб-барнома ва дигар роҳҳои дастрасӣ ба SoroLLM (минбаъд — «Барнома» ё «SoroLLM») ҳифз намояд. Ширкати фаръии мо — ҶДММ «ЗЕҲН АИ», ки дар Ҷумҳурии Тоҷикистон фаъолият мекунад, мутобиқати маҳаллӣ ва амалиётҳоро тибқи ин Сиёсати ҳифзи махфият таъмин менамояд.',
        },
        {
          kind: 'text',
          text: 'Ин Сиёсати ҳифзи махфият (ки метавонад вақт ба вақт тағйир дода шавад) масъалаҳои зеринро тавсиф мекунад:',
        },
        {
          kind: 'bullets',
          items: [
            'навъҳои маълумоте, ки мо ҳамчун корбари инфиродии Барнома аз шумо ҷамъ меоварем;',
            'тарзи истифода, нигоҳдорӣ ва ҳифзи маълумоти шумо;',
            'ҳуқуқ ва имконоти интихоби шумо вобаста ба маълумоти шахсӣ.',
          ],
        },
        {
          kind: 'text',
          text: 'Ин Сиёсати ҳифзи махфият мутобиқ ба қонунгузории амалкунанда, аз ҷумла Қонуни Ҷумҳурии Тоҷикистон «Дар бораи ҳифзи маълумоти шахсӣ» №1537 аз 3 августи соли 2018, Қонуни DIFC «Дар бораи ҳифзи маълумот» №5 аз соли 2020, инчунин дигар қонунҳо оид ба ҳифзи махфият ва маълумот, ки ба фаъолияти мо дахл доранд (минбаъд — «Қонунҳои ҳифзи маълумот»), ҳамчунин талаботи Apple App Store ва Google Play Store («Талаботи барнома») таҳия шудааст.',
        },
        {
          kind: 'text',
          text: 'Ин Сиёсат коркарди маълумоти шахсиро дар доираи уҳдадориҳои шартномавии мо дар самти ҳамкорӣ бо бахши хусусӣ (B2B) ва мақомоти давлатӣ (B2G) танзим намекунад. Агар шумо вобаста ба ҷамъоварӣ ва истифодаи маълумоти омӯзишӣ барои таҳияи модели забонии мо савол дошта бошед, метавонед бо мо тавассути почтаи электронӣ business@zehnlab.ai тамос гиред.',
        },
      ],
    },
    {
      heading: 'Маълумоте, ки мо ҷамъ меоварем',
      blocks: [
        {
          kind: 'text',
          text: 'Ҳангоми истифодаи SoroLLM мо маълумоти муайянеро дар бораи шумо ҷамъоварӣ ва коркард менамоем. Мо метавонем маълумотеро ҷамъ кунем, ки дар натиҷаи истифодаи Барнома аз ҷониби шумо ё ҳангоми мустақиман пешниҳод кардани он (масалан, ҳангоми муроҷиат ба мо) ба даст меояд, аз ҷумла:',
        },
        { kind: 'subheading', text: 'Маълумоти ҳисоб (Account Data)' },
        {
          kind: 'text',
          text: 'Ҳангоми таъсиси ҳисоб тавассути ҳар яке аз роҳҳои дастрасӣ ба SoroLLM, мо маълумоти марбут ба ҳисоби шуморо ҷамъ меоварем: ном, маълумоти тамос (почтаи электронӣ) ва маълумоти воридшавӣ.',
        },
        { kind: 'subheading', text: 'Маълумоти иртиботӣ (Communication Data)' },
        {
          kind: 'text',
          text: 'Агар шумо бо мо тамос гиред, мо маълумоти тамос ва муҳтавои паёмҳои ирсолнамудаи шуморо танҳо барои мақсадҳои дастгирӣ коркард мекунем.',
        },
        { kind: 'subheading', text: 'Мундариҷаи корбар ва маълумоти воридшаванда' },
        {
          kind: 'bullets',
          items: [
            'Саволҳо, дархостҳо ё матне, ки шумо ба Барнома ворид мекунед. Агар шумо аз имконияти «чати муваққатӣ» истифода баред, маълумоти воридшуда пас аз анҷоми ҷаласа нигоҳ дошта намешавад.',
            'Ҷавобҳои тавлидшудаи Барнома метавонанд муваққатан барои мақсадҳои ислоҳи хатогиҳо, назорати самаранокӣ ё — танҳо бо ризоияти ҷудогонаи шумо — барои омӯзиш ва такмили модели забонӣ нигоҳ дошта шаванд.',
          ],
        },
        {
          kind: 'text',
          text: 'Эзоҳ: Мо талаб намекунем ва ташвиқ ҳам намекунем, ки шумо маълумоти ҳассоси шахсиро (нажод, миллат, ақидаҳои сиёсӣ, дин, саломатӣ ва ғайра) пешниҳод намоед. Лутфан аз ворид кардани чунин маълумот худдорӣ намоед.',
        },
        { kind: 'subheading', text: 'Маълумоти техникӣ ва дастгоҳ' },
        {
          kind: 'bullets',
          items: [
            'Навъи дастгоҳ, низоми амалиётӣ, версияи барнома ва пайвастшавӣ.',
            'Суроғаи IP ва маълумоти умумии ҷойгиршавӣ, навъи браузер, сана ва вақти дастрасӣ, сабтҳои пайвастшавӣ (logs) ва гузоришҳои хато.',
            'Омори истифода ва маълумоти самаранокӣ.',
          ],
        },
      ],
    },
    {
      heading: 'Тарзи истифодаи маълумоти шумо',
      blocks: [
        { kind: 'text', text: 'Мо маълумоти шуморо барои мақсадҳои зерин истифода мебарем:' },
        {
          kind: 'bullets',
          items: [
            'Функсияҳои асосӣ: пешниҳод намудани ҷавобҳои тавлидшудаи зеҳни сунъӣ;',
            'Муошират: посух ба дархостҳо ва огоҳ намудан дар бораи тағйирот;',
            'Амният: пешгирии сӯиистифода, қаллобӣ ва таъмини амнияти системаҳо;',
            'Таҳлил: беҳтар фаҳмидани тамоюлҳои истифода ва такмили Барнома;',
            'Риояи қонун: иҷрои уҳдадориҳои ҳуқуқӣ.',
          ],
        },
      ],
    },
    {
      heading: 'Мубодила ва интиқоли маълумот',
      blocks: [
        {
          kind: 'text',
          text: 'Мо маълумоти шуморо намефурӯшем. Мо метавонем маълумотро ба шахсони сеюм (пудратчиён ва таъминкунандагон) танҳо барои пешниҳоди хизматрасонӣ ё дар ҳолатҳои зерин интиқол диҳем:',
        },
        {
          kind: 'bullets',
          items: [
            'Талаботи қонунӣ ва мақомоти давлатӣ;',
            'Интиқоли байналмилалӣ (аз ҷумла байни АМА ва Тоҷикистон) бо риояи тадбирҳои ҳифзи маълумот мувофиқи қонун.',
          ],
        },
      ],
    },
    {
      heading: 'Нигоҳдории маълумот ва амният',
      blocks: [
        { kind: 'text', text: 'Маълумот танҳо то замони зарурӣ нигоҳ дошта мешавад:' },
        {
          kind: 'bullets',
          items: [
            'Сабтҳои техникӣ: 30–90 рӯз;',
            'Маълумоти ҳисоб: то замони ҳазфи ҳисоб аз ҷониби корбар.',
          ],
        },
        {
          kind: 'text',
          text: 'Мо тадбирҳои техникию ташкилӣ, аз ҷумла рамзгузорӣ (TLS), назорати дастрасӣ ва провайдерҳои боэътимоди абриро барои ҳифзи маълумоти шумо татбиқ менамоем.',
        },
      ],
    },
    {
      heading: 'Ҳуқуқҳои корбар',
      blocks: [
        {
          kind: 'text',
          text: 'Шумо ҳуқуқ доред, ки ба маълумоти худ дастрасӣ пайдо кунед, онро ислоҳ ё ҳазф намоед, коркардро маҳдуд кунед ва ризоияти худро бозпас гиред.',
        },
      ],
    },
    {
      heading: 'Маълумоти тамос',
      blocks: [
        { kind: 'subheading', text: 'Саридора:' },
        { kind: 'text', text: 'zehn.ai Ltd' },
        { kind: 'text', text: 'Innovation Hub, DIFC, Дубай, Амороти Муттаҳидаи Араб' },
        { kind: 'text', text: 'Email: business@zehnlab.ai' },
        { kind: 'subheading', text: 'Ширкати фаръӣ:' },
        { kind: 'text', text: 'ҶДММ «ZEHN AI»' },
        {
          kind: 'text',
          text: 'Ҷумҳурии Тоҷикистон, ш. Душанбе, н. Исмоили Сомонӣ, кӯч. Шотемур 21, 734025',
        },
        { kind: 'text', text: 'Email: business@zehnlab.ai' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Английский — официальная редакция, она же полнее таджикской
// ---------------------------------------------------------------------------

const PRIVACY_POLICY_EN: LegalDocument = {
  title: 'Privacy Policy – SoroLLM',
  date: 'Date: January 15, 2026',
  sections: [
    {
      heading: 'Introduction',
      blocks: [
        {
          kind: 'text',
          text: 'zehn.ai Ltd ("we," "our," or "us") respects your privacy and is committed to protecting the personal information you share when using the SoroLLM mobile application, web app, and other access methods (the "App" or "SoroLLM"). Our subsidiary, LLC "ZEHN AI", operates in Tajikistan and assists with local compliance and operations as described in this Privacy Policy.',
        },
        {
          kind: 'text',
          text: 'This Privacy Policy, which may be amended from time to time, describes:',
        },
        {
          kind: 'bullets',
          items: [
            'The types of data we collect from you as an individual user of the App.',
            'How we use, store, and secure your data.',
            'Your rights and choices regarding your data.',
          ],
        },
        {
          kind: 'text',
          text: 'This Privacy Policy is designed to comply with applicable laws, including the Law of the Republic of Tajikistan on Personal Data Protection No. 1537 of August 3, 2018, the DIFC Data Protection Law No. 5 of 2020, and other privacy and data protection laws applicable to our operations (the "Data Protection Laws"), as well as requirements set by the Apple App Store and Google Play Store ("App Requirements").',
        },
        {
          kind: 'text',
          text: 'This Privacy Policy does not regulate processing of personal data as a part of our contractual B2B and B2G obligations. If you have any questions about how we collect and use training information to develop our language model in the App, please contact us at business@zehnlab.ai.',
        },
      ],
    },
    {
      heading: 'Information We Collect',
      blocks: [
        {
          kind: 'text',
          text: 'When you use SoroLLM, we collect and process certain information about you, as described in this section.',
        },
        {
          kind: 'text',
          text: 'In particular, we may collect data about you as a result of how you use the App, or when you give it to us directly (e.g., when you reach out to us). Such data includes the following:',
        },
        { kind: 'subheading', text: 'a. Account Data' },
        {
          kind: 'text',
          text: 'When you create an account in any of SoroLLM access methods, we will collect information associated with your account, including your name, contact information (email), account credentials.',
        },
        { kind: 'subheading', text: 'b. Communication Data' },
        {
          kind: 'text',
          text: 'If you contact us (e.g., via email), we may process your contact details and the contents of the messages you send strictly for support purposes.',
        },
        { kind: 'subheading', text: 'c. User Content and Input Data' },
        {
          kind: 'bullets',
          items: [
            'Prompts, questions, instructions or other content typed into the App. Where you use the "temporary chat" functionality within the App, none of the data you type into the chat will be stored beyond your chat session.',
            'Responses generated by the App may be stored temporarily for debugging, performance monitoring, or – only with your separate consent – for our language model training and improvement.',
            'Certain prompts, questions, or instructions that you type into SoroLLM may contain your personal data, depending on what you include. We do not control or monitor the content of your logs. If you choose to include any personal data in your communication with the App, you do so voluntarily and at your own risk and discretion.',
            'We do not request or in any way encourage that you share any sensitive personal data with us. By "sensitive personal data" we mean personal data revealing or concerning (directly or indirectly) particularly sensitive information about you, such as about racial or ethnic origin, political opinions, religious or philosophical beliefs, criminal records, health or sex life, genetic data, biometric data or data related to security measures. Please refrain from providing us or making available to us any sensitive personal data – including directly, through input into prompts, or otherwise.',
          ],
        },
        { kind: 'subheading', text: 'd. Technical and Device Data' },
        {
          kind: 'bullets',
          items: [
            'Device type (computer or mobile device), operating system, application version, and computer connection.',
            'IP address and related general location information (including time zone and country), operating system, browser type, dates and times of access, user agent and version connection logs, crash reports.',
            'Usage statistics and performance data (e.g., frequency of interactions, features used).',
          ],
        },
        { kind: 'subheading', text: 'Cookies' },
        {
          kind: 'text',
          text: 'Please note that we may use cookies and similar tracking technologies necessary to operate and administer the App.',
        },
      ],
    },
    {
      heading: 'How We Use Your Information',
      blocks: [
        { kind: 'text', text: 'We may use your data for the following purposes:' },
        {
          kind: 'bullets',
          items: [
            'Core functionality: to deliver AI-generated responses in the App.',
            'Communication: to communicate with you, including to respond to your questions or queries, or if we need to notify you on the changes in the App or the policies on the use of the App. We will not sell your personal data or use it for any direct marketing activities.',
            'Performance and security: to monitor uptime, detect and prevent misuse or abuse of the App, to prevent fraud and other illegal activity, to protect the security of our systems and the App, as well as to fix technical issues in the App.',
            'Analytics: to better understand usage trends, to improve and develop user experience, including, for example, to develop new features or tools within the App.',
            'Research and development (optional): only with your separate consent (given either through the Privacy Settings of the App or otherwise in the configuration of the App), we may use your prompts to further train and improve SoroLLM. You may withdraw your consent at any time.',
            'Legal compliance: to comply with our obligations under applicable laws, including the Data Protection Laws, App Requirements, or to protect the rights, privacy, safety, or property that we are responsible for, or to respond to lawful requests.',
          ],
        },
      ],
    },
    {
      heading: 'Data Sharing and Transfers',
      blocks: [
        {
          kind: 'text',
          text: 'We may share your data with third-party vendors and contractors to facilitate the provision of the service through the App. These third parties will be acting on our behalf under strict confidentiality obligations and are required to provide the same or equal protection of your data as described in this Privacy Policy.',
        },
        {
          kind: 'text',
          text: 'a. No Sale of Data: We do not sell your personal or usage data.',
        },
        {
          kind: 'text',
          text: 'b. Legal Obligations: We may disclose data if required to comply with applicable laws, regulation, or a request of a court of competent jurisdiction or a lawful authority.',
        },
        {
          kind: 'text',
          text: 'c. Data Transfers: We may need to transfer your data outside of your country where third party recipients (authorized third-party vendors and contractors) are based in another jurisdiction, including between our headquarters in the United Arab Emirates and our subsidiary in Tajikistan.',
        },
      ],
    },
    {
      heading: 'Data Retention',
      blocks: [
        {
          kind: 'text',
          text: 'We only keep your personal data for as long as necessary to fulfil the purposes for which we have collected it for (as described in this Privacy Policy), or for other legitimate business purposes such as resolving disputes, safety and security reasons, or complying with our legal obligations. You can request the deletion of your data at any time by contacting us as described in this Privacy Policy, and reasonable measures may be taken to verify your identity.',
        },
      ],
    },
    {
      heading: 'Data Security',
      blocks: [
        {
          kind: 'text',
          text: 'We implement appropriate technical and organizational measures to protect your data from unauthorized access, use, or disclosure. These measures include:',
        },
        {
          kind: 'bullets',
          items: [
            'Encryption of data in transit (TLS) and at rest.',
            'Strict access controls and monitoring.',
            'Secure or approved cloud hosting providers, in compliance with applicable Data Protection Laws and App Requirements.',
            'Regular security assessments and audits.',
            'Incident response procedures to address any data breaches or security incidents promptly and effectively.',
          ],
        },
        {
          kind: 'text',
          text: 'Despite these safeguards and our best efforts, no system is entirely secure, and we cannot guarantee absolute protection. Therefore, you should take special care in deciding what information you provide to the App.',
        },
      ],
    },
    {
      heading: 'Children',
      blocks: [
        {
          kind: 'text',
          text: 'The App is not intended for children under 18 years of age (or the minimum legal age in your jurisdiction). We do not knowingly collect information from children or allow the App to be used by children. If you have reason to believe that a child under 18 is using the App, please contact us at business@zehnlab.ai.',
        },
      ],
    },
    {
      heading: 'User Privacy Rights',
      blocks: [
        {
          kind: 'text',
          text: 'Under the applicable Data Protection Laws and relevant international principles, you may have the following rights:',
        },
        {
          kind: 'bullets',
          items: [
            'Right to Access: You have the right to request access to the personal data we hold about you.',
            'Right to Restrict Processing: In certain circumstances, you have the right to ask us to stop using or to restrict the processing of your personal data.',
            'Right to Object to Processing: You can object to certain types of data processing.',
            'Right to Withdraw Consent: You have the right to withdraw your consent for data use where we rely on consent as our sole legal basis.',
            'Right to Rectification: If you believe our records are inaccurate you have the right to ask for those records to be updated or corrected.',
            'Right to Erasure: You may request the deletion of your personal data when we no longer need it for the purposes for which it was collected.',
            'Right to Data Portability: Under certain conditions, you have the right to request that we transfer the personal data we hold about you to another organization, or directly to you.',
            'Right to Lodge a Complaint: You have the right to lodge a complaint with a competent data protection authority if you have grounds to believe that the processing of your personal data is not in compliance with the applicable laws and regulations.',
          ],
        },
        {
          kind: 'text',
          text: 'You may exercise these rights at any time by contacting us as described in this Privacy Policy.',
        },
      ],
    },
    {
      heading: 'Updates to this Privacy Policy',
      blocks: [
        {
          kind: 'text',
          text: 'We may update this Privacy Policy from time to time, and changes will be communicated via the App or our website, or via email. The latest version will always be available at zehn.ai/sorollm-privacy.',
        },
      ],
    },
    {
      heading: 'Contact Information',
      blocks: [
        {
          kind: 'text',
          text: 'If you have any questions or requests regarding this Privacy Policy, please contact us at:',
        },
        { kind: 'subheading', text: 'Headquarters:' },
        { kind: 'text', text: 'zehn.ai Ltd' },
        { kind: 'text', text: 'Unit IH-00-01-09-OF-06, Level 9, Innovation Hub, DIFC' },
        { kind: 'text', text: 'Dubai, United Arab Emirates' },
        { kind: 'text', text: 'Email: business@zehnlab.ai' },
        { kind: 'subheading', text: 'Subsidiary:' },
        { kind: 'text', text: 'LLC "ZEHN AI"' },
        {
          kind: 'text',
          text: 'Republic of Tajikistan, Dushanbe city, Ismoili Somoni district, Shotemur street 21, 734025',
        },
        { kind: 'text', text: 'Email: business@zehnlab.ai' },
      ],
    },
  ],
};

/**
 * Текст политики для языка интерфейса.
 *
 * РУССКОЙ РЕДАКЦИИ НЕТ. Юридический документ переводить самостоятельно
 * нельзя — цена ошибки в формулировке о персональных данных выше, чем
 * неудобство читать по-английски. Поэтому при русском интерфейсе
 * показывается английская редакция: она официальная и вдобавок полнее
 * таджикской (в ней есть разделы Cookies, Children, Data Portability и
 * Updates, которых в таджикском тексте нет). Как только юристы дадут
 * русский текст — он добавляется сюда третьей константой, и правка
 * ограничится одной строкой ниже.
 */
export function privacyPolicyFor(language: Language): LegalDocument {
  return language === 'tg' ? PRIVACY_POLICY_TG : PRIVACY_POLICY_EN;
}
