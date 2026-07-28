import { ASSETS, type FaqItem, type LinkItem } from "@/lib/site";
import type { ServiceId } from "@/lib/pricing";

export type ServiceLandingPage = {
  serviceId: ServiceId;
  slug: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  image: string;
  imageAlt: string;
  suitable: string[];
  included: string[];
  process: string[];
  why: string[];
  faq: FaqItem[];
  relatedLinks: LinkItem[];
};

const commonRelatedLinks: LinkItem[] = [
  { label: "Hausmeisterservice Hannover", href: "/hausmeisterservice-hannover" },
  { label: "Objektbetreuung Hannover", href: "/objektbetreuung-hannover" },
  { label: "Kostencheck starten", href: "/kosten-einschaetzen" },
];

export const serviceLandingPages: ServiceLandingPage[] = [
  {
    serviceId: "caretaker",
    slug: "hausmeisterservice-objektbetreuung-hannover",
    title: "Hausmeisterservice und Objektbetreuung Hannover | Hausvia",
    description:
      "Hausmeisterservice und Objektbetreuung in Hannover: laufende Betreuung, Sichtkontrollen, klare Zuständigkeit und kombinierbare Leistungen für Immobilien.",
    h1: "Hausmeisterservice und Objektbetreuung in Hannover",
    eyebrow: "Hausmeisterservice / Objektbetreuung",
    intro:
      "Hausvia übernimmt laufende Betreuung, Sichtkontrollen und klare Zuständigkeit am Objekt. Die Leistung eignet sich besonders, wenn Reinigung, Ordnung, Rückmeldung und kleine Objektaufgaben sinnvoll gebündelt werden sollen.",
    image: ASSETS.hero,
    imageAlt: "Hausvia Hausmeisterservice und Objektbetreuung in Hannover",
    suitable: [
      "Mehrfamilienhäuser, WEGs und Wohnanlagen mit regelmäßigem Betreuungsbedarf",
      "Hausverwaltungen, die feste Ansprechpartner und klare Rückmeldungen brauchen",
      "Gewerbeobjekte mit Eingangsbereichen, Außenflächen oder gemeinschaftlichen Bereichen",
    ],
    included: [
      "Regelmäßige Sichtkontrollen gemeinschaftlicher Bereiche",
      "Rückmeldung bei Schäden, Störungen oder sichtbarem Handlungsbedarf",
      "Koordination kleiner Aufgaben nach vereinbartem Leistungsumfang",
      "Kombination mit Reinigung, Mülldienst, Gartenpflege oder Kontrollgängen",
    ],
    process: [
      "Objektart, Standort und relevante Bereiche aufnehmen",
      "Turnus, Aufgaben und Ansprechpartner festlegen",
      "Betreuung regelmäßig ausführen und Auffälligkeiten zurückmelden",
      "Leistungsumfang bei Bedarf anpassen",
    ],
    why: [
      "Alles aus einer Hand statt vieler Einzelabsprachen",
      "Planbare Objektpflege für Eigentümer, WEGs und Verwaltungen",
      "Klare Kommunikation zu Schäden und Folgeaufgaben",
    ],
    faq: [
      {
        question: "Was gehört zum Hausmeisterservice?",
        answer:
          "Typisch sind Sichtkontrollen, Pflege gemeinschaftlicher Bereiche, Rückmeldungen zu Schäden und kombinierbare Aufgaben wie Reinigung, Mülldienst oder kleine Kontrollaufgaben.",
      },
      {
        question: "Ist laufende Objektbetreuung möglich?",
        answer:
          "Ja. Hausvia kann Leistungen regelmäßig nach vereinbartem Turnus und Leistungsumfang übernehmen.",
      },
    ],
    relatedLinks: commonRelatedLinks,
  },
  {
    serviceId: "interiorCleaning",
    slug: "treppenhausreinigung-innenreinigung-hannover",
    title: "Treppenhausreinigung und Innenreinigung Hannover | Hausvia",
    description:
      "Treppenhausreinigung und Innenreinigung in Hannover für Wohnanlagen, WEGs und Hausverwaltungen. Gemeinschaftliche Innenbereiche regelmäßig pflegen lassen.",
    h1: "Treppenhausreinigung und Innenreinigung in Hannover",
    eyebrow: "Treppenhausreinigung / Innenreinigung",
    intro:
      "Saubere Treppenhäuser, Flure und Eingangsbereiche prägen den ersten Eindruck eines Objekts. Hausvia übernimmt die regelmäßige Pflege gemeinschaftlicher Innenbereiche nach abgestimmtem Turnus.",
    image: ASSETS.hero,
    imageAlt: "Hausvia Treppenhausreinigung und Innenreinigung in Hannover",
    suitable: [
      "Mehrfamilienhäuser mit mehreren Parteien",
      "WEGs mit regelmäßig genutzten Eingangsbereichen",
      "Gewerbeobjekte mit Fluren, Zugängen oder Wartebereichen",
    ],
    included: [
      "Treppenstufen, Podeste, Handläufe und Eingangsbereiche reinigen",
      "Flure und gemeinschaftliche Innenbereiche pflegen",
      "Hinweise auf starke Verschmutzung oder Schäden zurückmelden",
      "Optional mit Mülldienst, Außenreinigung oder Kontrollgängen kombinieren",
    ],
    process: [
      "Objektgröße und Reinigungsbereiche klären",
      "Turnus und Umfang festlegen",
      "Regelmäßige Reinigung durchführen",
      "Auffälligkeiten an Ansprechpartner melden",
    ],
    why: [
      "Gepflegter erster Eindruck für Bewohner und Besucher",
      "Klare Zuständigkeit statt wechselnder Einzelabsprachen",
      "Sinnvolle Kombination mit laufender Objektbetreuung",
    ],
    faq: [
      {
        question: "Wie oft sollte ein Treppenhaus gereinigt werden?",
        answer:
          "Das hängt von Nutzung, Parteienzahl und Verschmutzung ab. Häufig sind wöchentliche oder regelmäßig abgestimmte Turnusse sinnvoll.",
      },
      {
        question: "Kann Innenreinigung mit Hausmeisterservice kombiniert werden?",
        answer:
          "Ja. Innenreinigung lässt sich sehr gut mit Kontrollgängen, Mülldienst und Objektbetreuung verbinden.",
      },
    ],
    relatedLinks: [
      { label: "Treppenhausreinigung Hannover", href: "/treppenhausreinigung-hannover" },
      ...commonRelatedLinks,
    ],
  },
  {
    serviceId: "outdoorCleaning",
    slug: "aussenreinigung-hof-muellplatz-hannover",
    title: "Außenreinigung, Hof und Müllplatz Hannover | Hausvia",
    description:
      "Außenreinigung in Hannover: Hof, Eingangswege und Müllplätze für Wohnanlagen und Gewerbeobjekte sichtbar ordentlich halten.",
    h1: "Außenreinigung für Hof, Eingangswege und Müllplatz in Hannover",
    eyebrow: "Außenreinigung / Hof / Müllplatz",
    intro:
      "Außenbereiche werden täglich gesehen und genutzt. Hausvia unterstützt dabei, Höfe, Eingangswege und Müllplätze regelmäßig ordentlich zu halten und sichtbare Probleme früh zurückzumelden.",
    image: ASSETS.bins,
    imageAlt: "Hausvia Außenreinigung Hof und Müllplatz in Hannover",
    suitable: [
      "Wohnanlagen mit Müllplatz, Hof oder mehreren Zuwegen",
      "WEGs mit gemeinschaftlichen Außenbereichen",
      "Gewerbeflächen mit sichtbaren Eingangs- und Aufenthaltsbereichen",
    ],
    included: [
      "Hof, Eingangswege und Müllplatz im vereinbarten Umfang sauber halten",
      "Sichtbare Verschmutzung und Unordnung zurückmelden",
      "Außenbereiche mit Mülldienst und Kontrollgängen kombinieren",
      "Regelmäßige Pflege statt sporadischer Einzelaktionen",
    ],
    process: [
      "Außenbereiche und Problemstellen aufnehmen",
      "Turnus und Umfang festlegen",
      "Regelmäßige Außenreinigung durchführen",
      "Auffälligkeiten und Zusatzbedarf melden",
    ],
    why: [
      "Ordentlicher Eindruck rund um Eingang, Hof und Müllplatz",
      "Entlastung für Verwaltungen und Eigentümer",
      "Direkt kombinierbar mit Mülldienst und Gartenpflege",
    ],
    faq: [
      {
        question: "Was zählt zur Außenreinigung?",
        answer:
          "Je nach Vereinbarung gehören Hofbereiche, Eingangswege, Müllplätze und sichtbare gemeinschaftliche Außenflächen dazu.",
      },
      {
        question: "Ist Außenreinigung auch für Gewerbe sinnvoll?",
        answer:
          "Ja. Gerade bei Kunden- oder Besucherflächen sorgt regelmäßige Außenreinigung für einen gepflegten Eindruck.",
      },
    ],
    relatedLinks: [
      { label: "Gebäudeservice Hannover", href: "/gebaeudeservice-hannover" },
      { label: "Mülltonnenservice Hannover", href: "/muelltonnenservice-hannover" },
      ...commonRelatedLinks,
    ],
  },
  {
    serviceId: "binService",
    slug: "muelldienst-hannover",
    title: "Mülldienst Hannover | Hausvia",
    description:
      "Mülldienst in Hannover: Tonnen bereitstellen, zurückstellen und Müllbereiche für Wohnanlagen und WEGs im Blick behalten.",
    h1: "Mülldienst in Hannover für Wohnanlagen und WEGs",
    eyebrow: "Mülldienst",
    intro:
      "Ein funktionierender Mülldienst reduziert Unordnung und Beschwerden im Objektalltag. Hausvia stellt Tonnen bereit, bringt sie zurück und hält den Müllbereich nach Vereinbarung im Blick.",
    image: ASSETS.bins,
    imageAlt: "Hausvia Mülldienst in Hannover an einer Wohnanlage",
    suitable: [
      "Mehrfamilienhäuser mit festen Abholterminen",
      "WEGs mit gemeinsam genutzten Müllplätzen",
      "Hausverwaltungen, die klare Zuständigkeit für Tonnen benötigen",
    ],
    included: [
      "Tonnen zu Abholterminen bereitstellen",
      "Tonnen an den vorgesehenen Standort zurückstellen",
      "Müllbereich sichtbar ordentlich halten",
      "Auffälligkeiten wie Fehlbefüllung oder Überfüllung melden",
    ],
    process: [
      "Abholtage und Tonnenstandorte klären",
      "Bereitstellung und Rückstellung festlegen",
      "Service regelmäßig ausführen",
      "Wiederkehrende Probleme zurückmelden",
    ],
    why: [
      "Weniger Chaos an sensiblen Gemeinschaftsflächen",
      "Planbare Abläufe für Bewohner und Verwaltung",
      "Gut kombinierbar mit Außenreinigung und Kontrollgängen",
    ],
    faq: [
      {
        question: "Ist Mülldienst dasselbe wie Mülltonnenservice?",
        answer:
          "Ja, im Kern geht es um Bereitstellen, Zurückstellen und Ordnung rund um die Tonnenstandorte.",
      },
      {
        question: "Kann Hausvia Fehlbefüllung melden?",
        answer:
          "Ja. Auffälligkeiten können nach Vereinbarung an Verwaltung oder Ansprechpartner zurückgemeldet werden.",
      },
    ],
    relatedLinks: [
      { label: "Mülltonnenservice Hannover", href: "/muelltonnenservice-hannover" },
      ...commonRelatedLinks,
    ],
  },
  {
    serviceId: "gardenCare",
    slug: "gartenpflege-aussenanlagenpflege-hannover",
    title: "Gartenpflege und Außenanlagenpflege Hannover | Hausvia",
    description:
      "Gartenpflege und Außenanlagenpflege in Hannover für Wohnanlagen, WEGs und Gewerbeobjekte. Grünflächen saisonal oder regelmäßig pflegen lassen.",
    h1: "Gartenpflege und Außenanlagenpflege in Hannover",
    eyebrow: "Gartenpflege",
    intro:
      "Gepflegte Grün- und Außenflächen tragen sichtbar zum Zustand einer Immobilie bei. Hausvia übernimmt Gartenpflege und Außenanlagenpflege nach Saison, Turnus und Objektbedarf.",
    image: ASSETS.garden,
    imageAlt: "Hausvia Gartenpflege und Außenanlagenpflege in Hannover",
    suitable: [
      "Wohnanlagen mit Grünflächen, Wegen und Eingangsbereichen",
      "Gewerbeobjekte mit repräsentativen Außenflächen",
      "WEGs, die regelmäßige Pflege statt Einzelkoordination wünschen",
    ],
    included: [
      "Grünflächen und Außenanlagen regelmäßig pflegen",
      "Pflegezustand und saisonalen Bedarf einschätzen",
      "Mit Rasenmähen, Heckenpflege oder Laubentfernung kombinieren",
      "Auffälligkeiten an Ansprechpartner zurückmelden",
    ],
    process: [
      "Außenfläche und Pflegezustand aufnehmen",
      "Turnus passend zu Saison und Nutzung festlegen",
      "Pflege regelmäßig durchführen",
      "Zusatzbedarf transparent abstimmen",
    ],
    why: [
      "Gepflegter Gesamteindruck rund um die Immobilie",
      "Planbarer Aufwand statt spontaner Einzelaufträge",
      "Kombinierbar mit Objektbetreuung und Winterdienst",
    ],
    faq: [
      {
        question: "Was umfasst Gartenpflege bei Hausvia?",
        answer:
          "Je nach Objekt gehören Grünflächenpflege, Rasen, Hecken, Laub und Außenanlagenpflege dazu.",
      },
      {
        question: "Kann die Pflege saisonal angepasst werden?",
        answer:
          "Ja. Der Umfang kann je nach Wachstum, Pflegezustand und Jahreszeit angepasst werden.",
      },
    ],
    relatedLinks: [{ label: "Gartenpflege Hannover", href: "/gartenpflege-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "lawnMowing",
    slug: "rasenmaehen-hannover",
    title: "Rasenmähen Hannover | Hausvia",
    description:
      "Rasenmähen in Hannover für Wohnanlagen, WEGs und Gewerbeobjekte. Rasenflächen regelmäßig im passenden Turnus mähen lassen.",
    h1: "Rasenmähen in Hannover für gepflegte Außenflächen",
    eyebrow: "Rasenmähen",
    intro:
      "Rasenflächen wirken schnell ungepflegt, wenn der Turnus nicht passt. Hausvia übernimmt Rasenmähen für Wohnanlagen, WEGs und Gewerbeobjekte nach abgestimmtem Pflegebedarf.",
    image: ASSETS.garden,
    imageAlt: "Hausvia Rasenmähen in Hannover an einer Wohnanlage",
    suitable: [
      "Rasenflächen an Mehrfamilienhäusern und Wohnanlagen",
      "Grünbereiche rund um Büros, Praxen oder Gewerbeflächen",
      "WEGs mit saisonalem Pflegebedarf",
    ],
    included: [
      "Rasenflächen im vereinbarten Turnus mähen",
      "Pflegebedarf nach Saison und Wachstum berücksichtigen",
      "Rasenmähen mit Gartenpflege oder Laubentfernung kombinieren",
      "Hinweise zu sichtbarem Zusatzbedarf zurückmelden",
    ],
    process: [
      "Fläche und Zugänglichkeit einschätzen",
      "Mähturnus passend zur Saison abstimmen",
      "Rasenpflege regelmäßig durchführen",
      "Bei Bedarf weitere Außenpflege ergänzen",
    ],
    why: [
      "Ordentliches Erscheinungsbild der Außenanlage",
      "Realistischer Turnus statt pauschalem Standard",
      "Sinnvoller Baustein laufender Gartenpflege",
    ],
    faq: [
      {
        question: "Wie oft sollte Rasen gemäht werden?",
        answer:
          "Das hängt von Saison, Wachstum und gewünschtem Pflegebild ab. Der Turnus wird passend zum Objekt abgestimmt.",
      },
      {
        question: "Ist Rasenmähen einzeln anfragbar?",
        answer:
          "Ja. Rasenmähen kann einzeln oder als Teil der Gartenpflege angefragt werden.",
      },
    ],
    relatedLinks: [{ label: "Gartenpflege Hannover", href: "/gartenpflege-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "hedgeCutting",
    slug: "hecken-strauchschnitt-hannover",
    title: "Hecken- und Strauchschnitt Hannover | Hausvia",
    description:
      "Hecken- und Strauchschnitt in Hannover für Wohnanlagen und Außenflächen. Saisonale Pflege nach Vereinbarung anfragen.",
    h1: "Hecken- und Strauchschnitt in Hannover",
    eyebrow: "Hecken- und Strauchschnitt",
    intro:
      "Hecken und Sträucher strukturieren Außenanlagen, brauchen aber saisonal abgestimmte Pflege. Hausvia übernimmt Hecken- und Strauchschnitt nach Vereinbarung und Objektbedarf.",
    image: ASSETS.garden,
    imageAlt: "Hausvia Hecken- und Strauchschnitt in Hannover",
    suitable: [
      "Wohnanlagen mit Hecken, Sträuchern und Pflanzbereichen",
      "Außenflächen an Mehrfamilienhäusern und WEGs",
      "Gewerbeflächen mit repräsentativen Grünbereichen",
    ],
    included: [
      "Hecken und Sträucher nach Saison und Vereinbarung schneiden",
      "Pflegezustand und Zugänglichkeit berücksichtigen",
      "Schnittarbeiten mit Gartenpflege und Rasenmähen kombinieren",
      "Zusatzbedarf transparent zurückmelden",
    ],
    process: [
      "Hecken- und Strauchbereiche aufnehmen",
      "Saisonalen Umfang abstimmen",
      "Schnitt nach Vereinbarung durchführen",
      "Pflegeintervall bei Bedarf anpassen",
    ],
    why: [
      "Gepflegte Außenwirkung der Immobilie",
      "Saisonale Planung statt ungeklärter Einzelaufträge",
      "Kombinierbar mit kompletter Außenanlagenpflege",
    ],
    faq: [
      {
        question: "Wann ist Hecken- und Strauchschnitt sinnvoll?",
        answer:
          "Der passende Zeitpunkt hängt von Pflanzen, Saison und gewünschtem Pflegebild ab und wird objektbezogen abgestimmt.",
      },
      {
        question: "Kann der Schnitt mit Gartenpflege kombiniert werden?",
        answer:
          "Ja. Häufig wird Heckenpflege mit Rasenmähen, Laubentfernung und Außenanlagenpflege kombiniert.",
      },
    ],
    relatedLinks: [{ label: "Gartenpflege Hannover", href: "/gartenpflege-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "leafRemoval",
    slug: "laubentfernung-hannover",
    title: "Laubentfernung Hannover | Hausvia",
    description:
      "Laubentfernung in Hannover für Wege, Eingänge und Außenflächen von Wohnanlagen, WEGs und Gewerbeobjekten.",
    h1: "Laubentfernung in Hannover für Wege und Außenflächen",
    eyebrow: "Laubentfernung",
    intro:
      "Laub auf Wegen, Eingängen und Außenflächen kann schnell ungepflegt wirken und je nach Situation rutschig werden. Hausvia übernimmt Laubentfernung saisonal und passend zum Objekt.",
    image: ASSETS.garden,
    imageAlt: "Hausvia Laubentfernung in Hannover",
    suitable: [
      "Wohnanlagen mit Gehwegen, Eingängen und Grünflächen",
      "WEGs mit saisonal starkem Laubaufkommen",
      "Gewerbeobjekte mit Besucherwegen und Parkbereichen",
    ],
    included: [
      "Laub auf Wegen, Eingängen und Außenflächen entfernen",
      "Saisonalen Turnus nach Bedarf abstimmen",
      "Mit Gartenpflege, Rasenmähen oder Winterdienst kombinieren",
      "Auffälligkeiten an Außenflächen zurückmelden",
    ],
    process: [
      "Laubbereiche und Saisonbedarf aufnehmen",
      "Turnus und Umfang vereinbaren",
      "Laubentfernung regelmäßig durchführen",
      "Bei höherem Bedarf nachjustieren",
    ],
    why: [
      "Sichtbar gepflegte Außenbereiche im Herbst",
      "Entlastung für Verwaltungen und Eigentümer",
      "Guter Baustein der laufenden Außenpflege",
    ],
    faq: [
      {
        question: "Ist Laubentfernung saisonal buchbar?",
        answer:
          "Ja. Laubentfernung kann saisonal für Herbst und laubintensive Phasen abgestimmt werden.",
      },
      {
        question: "Welche Flächen werden berücksichtigt?",
        answer:
          "Je nach Vereinbarung Wege, Eingänge, Außenflächen und weitere gemeinschaftliche Bereiche.",
      },
    ],
    relatedLinks: [{ label: "Gartenpflege Hannover", href: "/gartenpflege-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "winterService",
    slug: "winterdienst-hannover",
    title: "Winterdienst Hannover | Hausvia",
    description:
      "Winterdienst in Hannover als saisonale Unterstützung beim Räumen und Streuen nach Vereinbarung für Immobilien und Wohnanlagen.",
    h1: "Winterdienst in Hannover nach vereinbartem Objektbedarf",
    eyebrow: "Winterdienst",
    intro:
      "Winterdienst braucht klare Flächen, realistische Abstimmung und saisonale Planung. Hausvia unterstützt beim Räumen und Streuen nach Vereinbarung, ohne pauschale rechtliche Garantien zu versprechen.",
    image: ASSETS.hero,
    imageAlt: "Hausvia Winterdienst in Hannover für Wohnanlagen",
    suitable: [
      "Wohnanlagen mit Wegen, Eingängen und gemeinschaftlichen Außenbereichen",
      "WEGs, die Winterdienst mit Objektbetreuung verbinden möchten",
      "Gewerbeobjekte mit Besucher- oder Mitarbeiterzugängen",
    ],
    included: [
      "Saisonale Unterstützung beim Räumen und Streuen nach Vereinbarung",
      "Abzustimmende Flächen und Zeitfenster berücksichtigen",
      "Winterdienst mit Kontrollgängen oder Außenpflege kombinieren",
      "Keine falschen rechtlichen Garantien, sondern klare Leistungsabgrenzung",
    ],
    process: [
      "Winterflächen und Zugänglichkeit klären",
      "Leistungsumfang und Saisonbedarf abstimmen",
      "Räumen und Streuen nach Vereinbarung durchführen",
      "Besondere Situationen transparent zurückmelden",
    ],
    why: [
      "Saisonale Betreuung als Teil einer Objektpflege",
      "Klare Abstimmung statt unpräziser Pauschalversprechen",
      "Kombinierbar mit Hausmeisterservice und Außenanlagenpflege",
    ],
    faq: [
      {
        question: "Gibt Hausvia rechtliche Garantien für Winterdienst?",
        answer:
          "Nein. Der Leistungsumfang wird vereinbart, ersetzt aber keine individuelle rechtliche Prüfung zu Pflichten von Eigentümern oder Verwaltung.",
      },
      {
        question: "Kann Winterdienst saisonal angefragt werden?",
        answer:
          "Ja. Winterdienst kann saisonal und passend zum Objektbedarf angefragt werden.",
      },
    ],
    relatedLinks: [{ label: "Winterdienst Hannover", href: "/winterdienst-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "technicalChecks",
    slug: "technische-kontrollgaenge-hannover",
    title: "Technische Kontrollgänge Hannover | Hausvia",
    description:
      "Technische Kontrollgänge in Hannover: technische und gemeinschaftliche Bereiche regelmäßig per Sichtkontrolle prüfen lassen.",
    h1: "Technische Kontrollgänge in Hannover",
    eyebrow: "Technische Kontrollgänge",
    intro:
      "Technische Kontrollgänge helfen, Auffälligkeiten in gemeinschaftlichen und technischen Bereichen früh sichtbar zu machen. Hausvia prüft vereinbarte Bereiche per Sichtkontrolle und meldet Handlungsbedarf zurück.",
    image: ASSETS.repair,
    imageAlt: "Hausvia technische Kontrollgänge in Hannover",
    suitable: [
      "Mehrfamilienhäuser mit Technikräumen und gemeinschaftlichen Bereichen",
      "Gewerbeobjekte mit wiederkehrendem Kontrollbedarf",
      "Hausverwaltungen, die strukturierte Rückmeldungen erwarten",
    ],
    included: [
      "Technische und gemeinschaftliche Bereiche per Sichtkontrolle prüfen",
      "Auffälligkeiten, Schäden oder Störungen zurückmelden",
      "Kontrollgänge mit Beleuchtungskontrolle oder Technikraumprüfung kombinieren",
      "Keine Fachprüfung ersetzen, sondern sichtbaren Bedarf melden",
    ],
    process: [
      "Kontrollbereiche und Turnus definieren",
      "Sichtkontrollen regelmäßig durchführen",
      "Auffälligkeiten strukturiert zurückmelden",
      "Folgeschritte mit Ansprechpartnern abstimmen",
    ],
    why: [
      "Besserer Überblick über gemeinschaftliche Bereiche",
      "Frühere Rückmeldung bei sichtbarem Handlungsbedarf",
      "Sinnvoller Baustein laufender Objektbetreuung",
    ],
    faq: [
      {
        question: "Ersetzen technische Kontrollgänge eine Fachprüfung?",
        answer:
          "Nein. Hausvia übernimmt Sichtkontrollen und Rückmeldungen, ersetzt aber keine fachbetriebspflichtigen Prüfungen.",
      },
      {
        question: "Welche Bereiche können kontrolliert werden?",
        answer:
          "Je nach Objekt etwa Technikräume, Beleuchtung, gemeinschaftliche Bereiche und sichtbare Anlagenbereiche.",
      },
    ],
    relatedLinks: [{ label: "Kontrollgänge Hannover", href: "/kontrollgaenge-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "lightingChecks",
    slug: "beleuchtung-kontrollieren-hannover",
    title: "Beleuchtung kontrollieren Hannover | Hausvia",
    description:
      "Beleuchtung kontrollieren in Hannover: gemeinschaftliche Bereiche prüfen und Auffälligkeiten bei defekter Beleuchtung melden lassen.",
    h1: "Beleuchtung kontrollieren in Hannover",
    eyebrow: "Beleuchtung kontrollieren",
    intro:
      "Defekte Beleuchtung fällt im Alltag oft spät auf, kann aber schnell Beschwerden auslösen. Hausvia kontrolliert Beleuchtung in vereinbarten gemeinschaftlichen Bereichen und meldet Auffälligkeiten zurück.",
    image: ASSETS.repair,
    imageAlt: "Hausvia kontrolliert Beleuchtung in Hannover",
    suitable: [
      "Treppenhäuser, Flure und Eingangsbereiche",
      "Keller, Außenbereiche und gemeinschaftliche Wege",
      "Wohnanlagen und Gewerbeobjekte mit mehreren Leuchtpunkten",
    ],
    included: [
      "Beleuchtung in vereinbarten Bereichen prüfen",
      "Defekte oder Auffälligkeiten melden",
      "Kontrolle mit technischen Rundgängen kombinieren",
      "Keine Elektroarbeiten ohne separate fachliche Abstimmung",
    ],
    process: [
      "Zu prüfende Bereiche festlegen",
      "Kontrolle im vereinbarten Turnus durchführen",
      "Auffälligkeiten dokumentieren oder melden",
      "Nächste Schritte separat abstimmen",
    ],
    why: [
      "Mehr Überblick über sichtbare Defekte",
      "Geringerer Abstimmungsaufwand für Verwaltungen",
      "Praktische Ergänzung laufender Objektkontrollen",
    ],
    faq: [
      {
        question: "Tauscht Hausvia Leuchtmittel aus?",
        answer:
          "Kleinere Aufgaben können nach Abstimmung möglich sein. Elektroarbeiten oder größere Instandsetzungen werden separat geklärt.",
      },
      {
        question: "Wo wird die Beleuchtung kontrolliert?",
        answer:
          "Je nach Vereinbarung in Treppenhäusern, Eingängen, Kellern, Außenbereichen oder weiteren Gemeinschaftsflächen.",
      },
    ],
    relatedLinks: [{ label: "Kontrollgänge Hannover", href: "/kontrollgaenge-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "technicalRooms",
    slug: "technikraeume-kontrollieren-hannover",
    title: "Technikräume kontrollieren Hannover | Hausvia",
    description:
      "Technikräume in Hannover kontrollieren lassen: Heizungs- und Technikräume im vereinbarten Umfang per Sichtkontrolle prüfen.",
    h1: "Heizungs- und Technikräume kontrollieren in Hannover",
    eyebrow: "Heizungs-/Technikräume kontrollieren",
    intro:
      "Technikräume sollten nicht erst auffallen, wenn ein Problem akut wird. Hausvia kontrolliert Heizungs- und Technikräume im vereinbarten Umfang per Sichtkontrolle und meldet sichtbare Auffälligkeiten.",
    image: ASSETS.repair,
    imageAlt: "Hausvia kontrolliert Technikräume in Hannover",
    suitable: [
      "Mehrfamilienhäuser mit gemeinschaftlichen Technikbereichen",
      "WEGs und Wohnanlagen mit Heizungsräumen",
      "Gewerbeobjekte mit technischen Nebenräumen",
    ],
    included: [
      "Technikräume im vereinbarten Umfang per Sichtkontrolle prüfen",
      "Auffälligkeiten, Unordnung oder sichtbaren Handlungsbedarf melden",
      "Mit technischen Kontrollgängen kombinieren",
      "Keine Fachwartung ersetzen, sondern sichtbare Hinweise zurückmelden",
    ],
    process: [
      "Zugänge und Kontrollbereiche klären",
      "Turnus und Rückmeldeweg festlegen",
      "Sichtkontrolle durchführen",
      "Auffälligkeiten an Ansprechpartner melden",
    ],
    why: [
      "Mehr Ordnung und Übersicht in sensiblen Nebenbereichen",
      "Frühere Hinweise bei sichtbaren Auffälligkeiten",
      "Gute Ergänzung zur laufenden Objektbetreuung",
    ],
    faq: [
      {
        question: "Ist das eine Heizungswartung?",
        answer:
          "Nein. Hausvia übernimmt Sichtkontrollen und Rückmeldungen, keine fachliche Wartung oder Reparatur technischer Anlagen.",
      },
      {
        question: "Kann die Kontrolle regelmäßig erfolgen?",
        answer:
          "Ja. Turnus und Umfang können passend zum Objekt abgestimmt werden.",
      },
    ],
    relatedLinks: [{ label: "Kontrollgänge Hannover", href: "/kontrollgaenge-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "contractorAccess",
    slug: "dienstleisterzugang-organisieren-hannover",
    title: "Dienstleisterzugang organisieren Hannover | Hausvia",
    description:
      "Dienstleisterzugang in Hannover organisieren: Zugang zu Objekten nach Absprache erleichtern und Termine vor Ort begleiten.",
    h1: "Zugang für Dienstleister organisieren in Hannover",
    eyebrow: "Dienstleisterzugang organisieren",
    intro:
      "Viele Objekttermine scheitern an Abstimmung, Zugang oder fehlender Präsenz vor Ort. Hausvia kann Dienstleisterzugang nach Absprache organisieren und Termine rund um das Objekt erleichtern.",
    image: ASSETS.repair,
    imageAlt: "Hausvia organisiert Dienstleisterzugang in Hannover",
    suitable: [
      "Hausverwaltungen mit externen Handwerks- oder Prüfterminen",
      "WEGs, bei denen nicht immer ein Eigentümer vor Ort sein kann",
      "Gewerbeobjekte mit planbaren Dienstleisterterminen",
    ],
    included: [
      "Zugang für Dienstleister nach Absprache ermöglichen",
      "Termine vor Ort erleichtern",
      "Rückmeldung zu erledigten oder offenen Punkten geben",
      "Nicht als Bauleitung, sondern als praktische Objektunterstützung",
    ],
    process: [
      "Termin, Zugang und Ansprechpartner klären",
      "Vor-Ort-Unterstützung nach Absprache durchführen",
      "Rückmeldung zum Termin geben",
      "Folgeaufgaben separat abstimmen",
    ],
    why: [
      "Weniger Abstimmungsaufwand für Verwaltung oder Eigentümer",
      "Praktische Hilfe bei wiederkehrenden Objektterminen",
      "Sinnvoll in Kombination mit laufender Objektbetreuung",
    ],
    faq: [
      {
        question: "Kann Hausvia Dienstleistertermine begleiten?",
        answer:
          "Nach Absprache kann Hausvia Zugang ermöglichen und praktische Unterstützung am Objekt leisten.",
      },
      {
        question: "Übernimmt Hausvia Bauleitung?",
        answer:
          "Nein. Es geht um Zugang und praktische Abstimmung, nicht um technische Bauleitung oder Fachüberwachung.",
      },
    ],
    relatedLinks: [{ label: "Objektbetreuung Hannover", href: "/objektbetreuung-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "meterReading",
    slug: "zaehlerablesung-hannover",
    title: "Zählerablesung Hannover | Hausvia",
    description:
      "Zähler ablesen in Hannover: einfache Ablese- und Kontrollaufgaben rund um Wohnanlagen und Gewerbeobjekte übernehmen lassen.",
    h1: "Zähler ablesen in Hannover",
    eyebrow: "Zähler ablesen",
    intro:
      "Zählerablesungen und einfache Kontrollaufgaben sind kleine Tätigkeiten, die im Objektalltag trotzdem Zeit kosten. Hausvia kann solche Aufgaben nach Vereinbarung übernehmen und strukturiert zurückmelden.",
    image: ASSETS.repair,
    imageAlt: "Hausvia Zählerablesung in Hannover",
    suitable: [
      "Mehrfamilienhäuser mit gemeinschaftlichen Zählerbereichen",
      "Hausverwaltungen mit wiederkehrenden Ableseaufgaben",
      "Gewerbeobjekte mit einfachen Kontrollpunkten",
    ],
    included: [
      "Zählerstände nach vereinbartem Umfang ablesen",
      "Einfache Ablese- und Kontrollaufgaben übernehmen",
      "Rückmeldung an vereinbarte Ansprechpartner geben",
      "Mit Kontrollgängen und Objektbetreuung kombinieren",
    ],
    process: [
      "Zählerbereiche und Umfang klären",
      "Zeitpunkt und Rückmeldeweg festlegen",
      "Ablesung nach Vereinbarung durchführen",
      "Daten strukturiert zurückmelden",
    ],
    why: [
      "Praktische Entlastung bei wiederkehrenden Kleinstaufgaben",
      "Klare Rückmeldung statt ungeklärter Zuständigkeit",
      "Gut kombinierbar mit technischen Kontrollgängen",
    ],
    faq: [
      {
        question: "Welche Zähler kann Hausvia ablesen?",
        answer:
          "Das wird objektbezogen abgestimmt. Es geht um einfache Ableseaufgaben im vereinbarten Umfang.",
      },
      {
        question: "Kann die Zählerablesung regelmäßig erfolgen?",
        answer:
          "Ja. Zeitpunkt, Umfang und Rückmeldeweg können individuell abgestimmt werden.",
      },
    ],
    relatedLinks: [{ label: "Objektbetreuung Hannover", href: "/objektbetreuung-hannover" }, ...commonRelatedLinks],
  },
  {
    serviceId: "minorMaintenance",
    slug: "wartungs-kontrollaufgaben-hannover",
    title: "Wartungs- und Kontrollaufgaben Hannover | Hausvia",
    description:
      "Kleinere Wartungs- und Kontrollaufgaben in Hannover: einfache Kontroll- oder Bedienungsaufgaben ohne größere Handwerksleistungen übernehmen lassen.",
    h1: "Kleinere Wartungs- und Kontrollaufgaben in Hannover",
    eyebrow: "Wartungs- und Kontrollaufgaben",
    intro:
      "Nicht jede Objektaufgabe ist eine große Reparatur. Hausvia übernimmt einfache Kontroll- oder Bedienungsaufgaben nach Vereinbarung und meldet größere Themen transparent zurück.",
    image: ASSETS.repair,
    imageAlt: "Hausvia kleinere Wartungs- und Kontrollaufgaben in Hannover",
    suitable: [
      "Wohnanlagen mit wiederkehrenden kleinen Objektaufgaben",
      "Hausverwaltungen, die einfache Aufgaben strukturieren möchten",
      "Gewerbeobjekte mit regelmäßigem Kontrollbedarf",
    ],
    included: [
      "Einfache Kontroll- oder Bedienungsaufgaben übernehmen",
      "Kleinere Wartungspunkte im vereinbarten Rahmen prüfen",
      "Größere Reparaturen und Facharbeiten separat zurückmelden",
      "Mit Hausmeisterservice und Kontrollgängen kombinieren",
    ],
    process: [
      "Aufgaben und Grenzen klar definieren",
      "Turnus und Rückmeldeweg abstimmen",
      "Einfache Aufgaben zuverlässig durchführen",
      "Nicht enthaltene Facharbeiten separat melden",
    ],
    why: [
      "Klare Abgrenzung statt unklarer Reparaturversprechen",
      "Mehr Ordnung bei wiederkehrenden Kleinstaufgaben",
      "Sinnvolle Ergänzung zur laufenden Objektbetreuung",
    ],
    faq: [
      {
        question: "Sind größere Reparaturen enthalten?",
        answer:
          "Nein. Größere Reparaturen, Instandsetzungen und fachbetriebspflichtige Arbeiten werden separat kalkuliert oder an Fachbetriebe verwiesen.",
      },
      {
        question: "Kann Hausvia einfache Kontrollaufgaben regelmäßig übernehmen?",
        answer:
          "Ja. Der Umfang wird vorab abgestimmt und kann in die laufende Betreuung aufgenommen werden.",
      },
    ],
    relatedLinks: [
      { label: "Kleinreparaturen Hannover", href: "/kleinreparaturen-hannover" },
      { label: "Kontrollgänge Hannover", href: "/kontrollgaenge-hannover" },
      ...commonRelatedLinks,
    ],
  },
];

export function findServiceLandingPage(slug: string) {
  return serviceLandingPages.find((page) => page.slug === slug);
}

export function getServiceLandingPageById(serviceId: ServiceId) {
  return serviceLandingPages.find((page) => page.serviceId === serviceId);
}
