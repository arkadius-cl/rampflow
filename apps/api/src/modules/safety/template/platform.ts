import type { DriverLocale } from '@rampflow/shared';
import type { ContentBody } from '@rampflow/shared/modules/safety/api.authoring';
import { BlockKind, PictogramId, TranslationState } from '@rampflow/shared/modules/safety/values';

// The 12-language platform template (SF-01, domain research §4). Pictograms and correct answers
// are fixed here once; each locale supplies only text, so every locale has the same shape.

const RULE_PICTOGRAMS = [
  PictogramId.hi_vis_vest,
  PictogramId.speed_limit_10,
  PictogramId.forklift_traffic,
  PictogramId.wheel_chock,
  PictogramId.no_smoking,
  PictogramId.assembly_point,
] as const satisfies readonly PictogramId[];

const CORRECT = [1, 0, 1] as const;

/** One `V` per element of `T`, so a locale cannot miss or add a rule or a question. */
type Each<T extends readonly unknown[], V> = { readonly [K in keyof T]: V };
type Rules = Each<typeof RULE_PICTOGRAMS, string>;
type Options = readonly [string, string, string];
type Questions = Each<typeof CORRECT, readonly [prompt: string, options: Options]>;

interface LocaleText {
  title: string;
  rules: Rules;
  statement: string;
  questions: Questions;
}

const TEXT: Record<DriverLocale, LocaleText> = {
  en: {
    title: 'Site safety rules for drivers',
    rules: [
      'Wear a high-visibility vest at all times on site, and safety shoes whenever you leave the cab.',
      'Drive at walking pace, no faster than 10 km/h. Follow the signs and never reverse without a banksman.',
      'Forklifts operate in the loading area. Stay in the waiting area while your truck is loaded or unloaded. Do not operate site equipment such as forklifts, pallet trucks or dock levellers.',
      'At the dock, apply the parking brake, place the wheel chocks and follow the signal lights. Never drive off before staff release you. Securing the load remains your responsibility.',
      'No smoking outside marked areas, no alcohol, no phone use while driving and no photography on site.',
      'If the alarm sounds, go to the assembly point. Report every accident or hazard to site staff immediately.',
    ],
    statement: 'I have read and understood these safety rules and will follow them on site.',
    questions: [
      ['What is the speed limit on site?', ['30 km/h', '10 km/h', 'There is no limit']],
      [
        'Where do you stay while your truck is loaded or unloaded?',
        ['In the waiting area', 'Next to the forklift', 'Inside the warehouse'],
      ],
      [
        'When may you drive away from the dock?',
        ['As soon as the doors are closed', 'When the staff release me', 'Whenever I am ready'],
      ],
    ],
  },
  de: {
    title: 'Sicherheitsregeln für Fahrer auf dem Gelände',
    rules: [
      'Tragen Sie auf dem Gelände jederzeit eine Warnweste und Sicherheitsschuhe, sobald Sie das Fahrerhaus verlassen.',
      'Fahren Sie Schrittgeschwindigkeit, höchstens 10 km/h. Beachten Sie die Beschilderung und setzen Sie nie ohne Einweiser zurück.',
      'Im Ladebereich fahren Gabelstapler. Bleiben Sie während der Be- und Entladung im Wartebereich. Bedienen Sie keine Geräte des Standorts wie Gabelstapler, Hubwagen oder Überladebrücken.',
      'Ziehen Sie an der Rampe die Feststellbremse an, legen Sie Unterlegkeile und beachten Sie die Signalampel. Fahren Sie nie ab, bevor das Personal Sie freigibt. Die Ladungssicherung bleibt Ihre Verantwortung.',
      'Rauchen nur in gekennzeichneten Bereichen, kein Alkohol, kein Telefon während der Fahrt und keine Fotos auf dem Gelände.',
      'Gehen Sie bei Alarm zum Sammelplatz. Melden Sie jeden Unfall und jede Gefahr sofort dem Personal.',
    ],
    statement:
      'Ich habe diese Sicherheitsregeln gelesen und verstanden und halte sie auf dem Gelände ein.',
    questions: [
      [
        'Wie schnell dürfen Sie auf dem Gelände fahren?',
        ['30 km/h', '10 km/h', 'Es gibt keine Begrenzung'],
      ],
      [
        'Wo halten Sie sich während der Be- und Entladung auf?',
        ['Im Wartebereich', 'Neben dem Gabelstapler', 'In der Halle'],
      ],
      [
        'Wann dürfen Sie von der Rampe abfahren?',
        ['Sobald die Türen geschlossen sind', 'Wenn das Personal mich freigibt', 'Wann ich will'],
      ],
    ],
  },
  pl: {
    title: 'Zasady bezpieczeństwa dla kierowców na terenie zakładu',
    rules: [
      'Na terenie zakładu zawsze noś kamizelkę odblaskową, a obuwie ochronne za każdym razem, gdy wychodzisz z kabiny.',
      'Jedź z prędkością pieszego, nie szybciej niż 10 km/h. Przestrzegaj oznakowania i nigdy nie cofaj bez osoby kierującej.',
      'W strefie załadunku jeżdżą wózki widłowe. Podczas załadunku i rozładunku pozostań w strefie oczekiwania. Nie obsługuj urządzeń zakładu, takich jak wózki widłowe, wózki paletowe czy pomosty przeładunkowe.',
      'Przy rampie zaciągnij hamulec postojowy, podłóż kliny pod koła i stosuj się do sygnalizacji świetlnej. Nigdy nie odjeżdżaj, zanim personel cię nie zwolni. Za zabezpieczenie ładunku odpowiadasz ty.',
      'Palenie tylko w wyznaczonych miejscach, zakaz alkoholu, zakaz używania telefonu podczas jazdy i zakaz fotografowania na terenie zakładu.',
      'Po usłyszeniu alarmu udaj się na miejsce zbiórki. Każdy wypadek i zagrożenie natychmiast zgłoś personelowi.',
    ],
    statement:
      'Przeczytałem i zrozumiałem te zasady bezpieczeństwa i będę ich przestrzegać na terenie zakładu.',
    questions: [
      [
        'Jaka jest dopuszczalna prędkość na terenie zakładu?',
        ['30 km/h', '10 km/h', 'Nie ma ograniczenia'],
      ],
      [
        'Gdzie przebywasz podczas załadunku lub rozładunku?',
        ['W strefie oczekiwania', 'Obok wózka widłowego', 'W magazynie'],
      ],
      [
        'Kiedy możesz odjechać od rampy?',
        ['Gdy tylko drzwi są zamknięte', 'Gdy personel mnie zwolni', 'Kiedy chcę'],
      ],
    ],
  },
  ro: {
    title: 'Reguli de siguranță pentru șoferi pe amplasament',
    rules: [
      'Purtați în permanență o vestă reflectorizantă pe amplasament și încălțăminte de protecție ori de câte ori coborâți din cabină.',
      'Conduceți la pas, cu cel mult 10 km/h. Respectați indicatoarele și nu mergeți niciodată cu spatele fără un îndrumător.',
      'În zona de încărcare circulă stivuitoare. Rămâneți în zona de așteptare în timpul încărcării sau descărcării. Nu folosiți echipamentele amplasamentului, cum ar fi stivuitoarele, transpaletele sau rampele de nivelare.',
      'La rampă, trageți frâna de parcare, puneți calele sub roți și respectați semnalele luminoase. Nu plecați niciodată înainte ca personalul să vă elibereze. Asigurarea încărcăturii rămâne responsabilitatea dumneavoastră.',
      'Fumatul este permis doar în zonele marcate. Fără alcool, fără telefon în timpul condusului și fără fotografii pe amplasament.',
      'La alarmă, mergeți la punctul de adunare. Raportați imediat personalului orice accident sau pericol.',
    ],
    statement:
      'Am citit și am înțeles aceste reguli de siguranță și le voi respecta pe amplasament.',
    questions: [
      ['Care este limita de viteză pe amplasament?', ['30 km/h', '10 km/h', 'Nu există limită']],
      [
        'Unde stați în timpul încărcării sau descărcării?',
        ['În zona de așteptare', 'Lângă stivuitor', 'În depozit'],
      ],
      [
        'Când aveți voie să plecați de la rampă?',
        ['Imediat ce ușile sunt închise', 'Când personalul mă eliberează', 'Oricând vreau'],
      ],
    ],
  },
  bg: {
    title: 'Правила за безопасност за шофьори на обекта',
    rules: [
      'Носете светлоотразителна жилетка през цялото време на обекта и защитни обувки винаги, когато слизате от кабината.',
      'Карайте с бавна скорост, не повече от 10 км/ч. Спазвайте знаците и никога не давайте на заден ход без регулировчик.',
      'В зоната за товарене работят мотокари. Останете в зоната за изчакване, докато камионът се товари или разтоварва. Не работете с оборудването на обекта, като мотокари, палетни колички или товарни рампи.',
      'На рампата дръпнете ръчната спирачка, поставете клинове под колелата и следвайте светлинните сигнали. Никога не потегляйте, преди персоналът да ви освободи. Обезопасяването на товара остава ваша отговорност.',
      'Пушенето е разрешено само на обозначените места. Без алкохол, без телефон по време на шофиране и без снимане на обекта.',
      'При сигнал за тревога отидете до мястото за събиране. Съобщавайте незабавно на персонала за всяка злополука или опасност.',
    ],
    statement: 'Прочетох и разбрах тези правила за безопасност и ще ги спазвам на обекта.',
    questions: [
      ['Какво е ограничението на скоростта на обекта?', ['30 км/ч', '10 км/ч', 'Няма ограничение']],
      [
        'Къде стоите, докато камионът се товари или разтоварва?',
        ['В зоната за изчакване', 'До мотокара', 'В склада'],
      ],
      [
        'Кога можете да потеглите от рампата?',
        ['Веднага щом вратите са затворени', 'Когато персоналът ме освободи', 'Когато поискам'],
      ],
    ],
  },
  lt: {
    title: 'Saugos taisyklės vairuotojams teritorijoje',
    rules: [
      'Teritorijoje visada dėvėkite ryškiaspalvę liemenę, o išlipę iš kabinos – apsauginę avalynę.',
      'Važiuokite žingsnio greičiu, ne greičiau kaip 10 km/h. Laikykitės ženklų ir niekada nevažiuokite atbuline eiga be reguliuotojo.',
      'Pakrovimo zonoje važinėja krautuvai. Pakrovimo ir iškrovimo metu likite laukimo zonoje. Nenaudokite teritorijos įrangos, pavyzdžiui, krautuvų, padėklų vežimėlių ar rampos išlyginimo platformų.',
      'Prie rampos įjunkite stovėjimo stabdį, padėkite ratų atramas ir laikykitės šviesos signalų. Niekada neišvažiuokite, kol personalas jūsų neišleido. Už krovinio pritvirtinimą atsakote jūs.',
      'Rūkyti galima tik pažymėtose vietose. Draudžiama vartoti alkoholį, naudotis telefonu vairuojant ir fotografuoti teritorijoje.',
      'Išgirdę pavojaus signalą eikite į susirinkimo vietą. Apie kiekvieną nelaimingą atsitikimą ar pavojų nedelsdami praneškite personalui.',
    ],
    statement: 'Perskaičiau ir supratau šias saugos taisykles ir jų laikysiuosi teritorijoje.',
    questions: [
      ['Koks yra greičio apribojimas teritorijoje?', ['30 km/h', '10 km/h', 'Apribojimo nėra']],
      [
        'Kur būnate, kol sunkvežimis kraunamas arba iškraunamas?',
        ['Laukimo zonoje', 'Šalia krautuvo', 'Sandėlyje'],
      ],
      [
        'Kada galite išvažiuoti nuo rampos?',
        ['Kai tik uždarytos durys', 'Kai personalas mane išleidžia', 'Kada noriu'],
      ],
    ],
  },
  uk: {
    title: 'Правила безпеки для водіїв на території',
    rules: [
      'На території завжди носіть світловідбивний жилет, а захисне взуття — щоразу, коли виходите з кабіни.',
      'Їдьте зі швидкістю пішохода, не швидше 10 км/год. Дотримуйтеся знаків і ніколи не рухайтеся заднім ходом без регулювальника.',
      'У зоні завантаження працюють навантажувачі. Під час завантаження та розвантаження залишайтеся в зоні очікування. Не користуйтеся обладнанням території, як-от навантажувачами, візками для палет чи рампами-вирівнювачами.',
      'Біля рампи затягніть стоянкове гальмо, підкладіть противідкатні упори та дотримуйтеся світлових сигналів. Ніколи не від’їжджайте, доки персонал вас не відпустить. За кріплення вантажу відповідаєте ви.',
      'Палити можна лише в позначених місцях. Заборонено алкоголь, телефон під час керування та фотографування на території.',
      'Під час тривоги йдіть до місця збору. Негайно повідомляйте персонал про кожен нещасний випадок або небезпеку.',
    ],
    statement: 'Я прочитав і зрозумів ці правила безпеки та дотримуватимусь їх на території.',
    questions: [
      ['Яке обмеження швидкості на території?', ['30 км/год', '10 км/год', 'Обмеження немає']],
      [
        'Де ви перебуваєте під час завантаження або розвантаження?',
        ['У зоні очікування', 'Біля навантажувача', 'На складі'],
      ],
      [
        'Коли можна від’їхати від рампи?',
        ['Щойно двері зачинені', 'Коли персонал мене відпустить', 'Коли захочу'],
      ],
    ],
  },
  ru: {
    title: 'Правила безопасности для водителей на территории',
    rules: [
      'На территории всегда носите светоотражающий жилет, а защитную обувь — каждый раз, когда выходите из кабины.',
      'Двигайтесь со скоростью пешехода, не быстрее 10 км/ч. Соблюдайте знаки и никогда не сдавайте назад без регулировщика.',
      'В зоне погрузки работают погрузчики. Во время погрузки и разгрузки оставайтесь в зоне ожидания. Не пользуйтесь оборудованием территории, например погрузчиками, тележками для паллет или уравнительными платформами.',
      'У рампы затяните стояночный тормоз, установите противооткатные упоры и следуйте световым сигналам. Никогда не уезжайте, пока персонал вас не отпустит. За крепление груза отвечаете вы.',
      'Курить можно только в отведённых местах. Запрещены алкоголь, телефон за рулём и фотосъёмка на территории.',
      'При сигнале тревоги идите к месту сбора. Немедленно сообщайте персоналу о любом несчастном случае или опасности.',
    ],
    statement: 'Я прочитал и понял эти правила безопасности и буду соблюдать их на территории.',
    questions: [
      ['Какое ограничение скорости на территории?', ['30 км/ч', '10 км/ч', 'Ограничения нет']],
      [
        'Где вы находитесь во время погрузки или разгрузки?',
        ['В зоне ожидания', 'Рядом с погрузчиком', 'На складе'],
      ],
      [
        'Когда можно отъехать от рампы?',
        ['Как только двери закрыты', 'Когда персонал меня отпустит', 'Когда захочу'],
      ],
    ],
  },
  cs: {
    title: 'Bezpečnostní pravidla pro řidiče v areálu',
    rules: [
      'V areálu vždy noste reflexní vestu a bezpečnostní obuv, kdykoli vystoupíte z kabiny.',
      'Jeďte rychlostí chůze, nejvýše 10 km/h. Řiďte se značením a nikdy necouvejte bez navádějící osoby.',
      'V nakládacím prostoru jezdí vysokozdvižné vozíky. Během nakládky a vykládky zůstaňte v čekací zóně. Neobsluhujte zařízení areálu, jako jsou vysokozdvižné vozíky, paletové vozíky nebo nakládací můstky.',
      'U rampy zatáhněte parkovací brzdu, podložte kola klíny a řiďte se světelnou signalizací. Nikdy neodjíždějte, dokud vás personál neuvolní. Za zajištění nákladu odpovídáte vy.',
      'Kouření pouze ve vyznačených místech, žádný alkohol, žádný telefon za jízdy a žádné fotografování v areálu.',
      'Při poplachu jděte na shromaždiště. Každou nehodu nebo nebezpečí ihned nahlaste personálu.',
    ],
    statement:
      'Přečetl jsem si tato bezpečnostní pravidla, rozumím jim a budu je v areálu dodržovat.',
    questions: [
      ['Jaká je povolená rychlost v areálu?', ['30 km/h', '10 km/h', 'Není omezena']],
      [
        'Kde se zdržujete během nakládky nebo vykládky?',
        ['V čekací zóně', 'Vedle vysokozdvižného vozíku', 'Ve skladu'],
      ],
      [
        'Kdy smíte odjet od rampy?',
        ['Jakmile jsou dveře zavřené', 'Když mě personál uvolní', 'Kdykoli chci'],
      ],
    ],
  },
  sk: {
    title: 'Bezpečnostné pravidlá pre vodičov v areáli',
    rules: [
      'V areáli vždy noste reflexnú vestu a bezpečnostnú obuv vždy, keď vystúpite z kabíny.',
      'Jazdite rýchlosťou chôdze, najviac 10 km/h. Riaďte sa značením a nikdy necúvajte bez navádzajúcej osoby.',
      'V nakladacom priestore jazdia vysokozdvižné vozíky. Počas nakládky a vykládky zostaňte v čakacej zóne. Neobsluhujte zariadenia areálu, ako sú vysokozdvižné vozíky, paletové vozíky alebo nakladacie mostíky.',
      'Pri rampe zatiahnite parkovaciu brzdu, podložte kolesá klinmi a riaďte sa svetelnou signalizáciou. Nikdy neodchádzajte, kým vás personál neuvoľní. Za zaistenie nákladu zodpovedáte vy.',
      'Fajčenie len na vyznačených miestach, žiadny alkohol, žiadny telefón počas jazdy a žiadne fotografovanie v areáli.',
      'Pri poplachu choďte na zhromaždisko. Každú nehodu alebo nebezpečenstvo ihneď nahláste personálu.',
    ],
    statement:
      'Prečítal som si tieto bezpečnostné pravidlá, rozumiem im a budem ich v areáli dodržiavať.',
    questions: [
      ['Aká je povolená rýchlosť v areáli?', ['30 km/h', '10 km/h', 'Nie je obmedzená']],
      [
        'Kde sa zdržiavate počas nakládky alebo vykládky?',
        ['V čakacej zóne', 'Vedľa vysokozdvižného vozíka', 'V sklade'],
      ],
      [
        'Kedy smiete odísť od rampy?',
        ['Hneď ako sú dvere zatvorené', 'Keď ma personál uvoľní', 'Kedykoľvek chcem'],
      ],
    ],
  },
  hu: {
    title: 'Biztonsági szabályok sofőröknek a telephelyen',
    rules: [
      'A telephelyen mindig viseljen láthatósági mellényt, a fülkéből kiszállva pedig biztonsági cipőt.',
      'Lépésben haladjon, legfeljebb 10 km/h sebességgel. Kövesse a táblákat, és soha ne tolasson irányító nélkül.',
      'A rakodóterületen targoncák közlekednek. Be- és kirakodás közben maradjon a várakozó területen. Ne kezelje a telephely eszközeit, például targoncát, raklapemelőt vagy rakodóhidat.',
      'A rámpánál húzza be a rögzítőféket, tegye fel a kerékékeket, és kövesse a jelzőlámpákat. Soha ne induljon el, amíg a személyzet el nem engedi. A rakomány rögzítéséért Ön felel.',
      'Dohányozni csak a kijelölt helyeken szabad. Tilos az alkohol, a telefonhasználat vezetés közben és a fényképezés a telephelyen.',
      'Riasztáskor menjen a gyülekezési pontra. Minden balesetet és veszélyt azonnal jelentsen a személyzetnek.',
    ],
    statement:
      'Elolvastam és megértettem ezeket a biztonsági szabályokat, és betartom őket a telephelyen.',
    questions: [
      ['Mekkora a megengedett sebesség a telephelyen?', ['30 km/h', '10 km/h', 'Nincs korlátozás']],
      [
        'Hol tartózkodik be- vagy kirakodás közben?',
        ['A várakozó területen', 'A targonca mellett', 'A raktárban'],
      ],
      [
        'Mikor indulhat el a rámpától?',
        ['Amint az ajtók becsukódtak', 'Amikor a személyzet elenged', 'Amikor akarok'],
      ],
    ],
  },
  tr: {
    title: 'Sahada sürücüler için güvenlik kuralları',
    rules: [
      'Sahada her zaman reflektörlü yelek giyin; kabinden her indiğinizde iş güvenliği ayakkabısı giyin.',
      'Yürüme hızında, en fazla 10 km/sa ile sürün. İşaretlere uyun ve yönlendirici olmadan asla geri manevra yapmayın.',
      'Yükleme alanında forkliftler çalışır. Yükleme ve boşaltma sırasında bekleme alanında kalın. Forklift, transpalet veya rampa köprüsü gibi saha ekipmanlarını kullanmayın.',
      'Rampada el frenini çekin, takozları yerleştirin ve ışıklı sinyallere uyun. Personel izin vermeden asla hareket etmeyin. Yükün emniyete alınması sizin sorumluluğunuzdadır.',
      'Sigara yalnızca işaretli alanlarda içilebilir. Alkol, sürüş sırasında telefon kullanımı ve sahada fotoğraf çekmek yasaktır.',
      'Alarm çaldığında toplanma noktasına gidin. Her kazayı veya tehlikeyi derhal personele bildirin.',
    ],
    statement: 'Bu güvenlik kurallarını okudum, anladım ve sahada bunlara uyacağım.',
    questions: [
      ['Sahadaki hız sınırı nedir?', ['30 km/sa', '10 km/sa', 'Sınır yoktur']],
      [
        'Yükleme veya boşaltma sırasında nerede beklersiniz?',
        ['Bekleme alanında', 'Forkliftin yanında', 'Deponun içinde'],
      ],
      [
        'Rampadan ne zaman ayrılabilirsiniz?',
        ['Kapılar kapanır kapanmaz', 'Personel izin verdiğinde', 'İstediğim zaman'],
      ],
    ],
  },
};

/** Authored in these; every other locale is a machine translation until someone reviews it. */
const SOURCE_LOCALES: ReadonlySet<DriverLocale> = new Set(['de', 'en']);

export const translationOf = (locale: DriverLocale): TranslationState =>
  SOURCE_LOCALES.has(locale) ? TranslationState.source : TranslationState.machine;

/** One locale of the template; questions only for tenants with `safety.quiz` (SF-02). */
export function templateContent(locale: DriverLocale, options: { quiz: boolean }): ContentBody {
  const text = TEXT[locale];
  return {
    title: text.title,
    blocks: RULE_PICTOGRAMS.flatMap((id, i) => [
      { kind: BlockKind.pictogram, id },
      { kind: BlockKind.text, text: text.rules[i] as string },
    ]),
    questions: options.quiz
      ? text.questions.map(([prompt, opts], i) => ({
          id: `q${i + 1}`,
          prompt,
          options: [...opts],
          correct: CORRECT[i] as number,
        }))
      : [],
    statement: text.statement,
    translation: translationOf(locale),
  };
}
