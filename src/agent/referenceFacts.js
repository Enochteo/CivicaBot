export const GRAMBLING_REFERENCE_FACTS = [
  {
    title: "Mayor of Grambling",
    summary: "Mayor Alvin R. Bradley, Sr.",
    source: "City of Grambling official website",
  },
  {
    title: "City Hall",
    summary: "127 King Street, Grambling, Louisiana 71245",
    source: "City of Grambling official website",
  },
  {
    title: "City Hall phone",
    summary: "(318) 247-6120",
    source: "City of Grambling official website",
  },
  {
    title: "Police Department",
    summary: "(318) 247-3771",
    source: "City of Grambling official website",
  },
  {
    title: "Fire Department",
    summary: "(318) 247-8733",
    source: "City of Grambling official website",
  },
  {
    title: "Public Works",
    summary: "(318) 596-3144",
    source: "City of Grambling official website",
  },
  {
    title: "Grambling City Council",
    summary:
      "Councilwoman Mayor Pro-Tem Delores Wilkerson Smith, Councilman John Brown, Jr., Councilwoman Cathy Holmes Giles, Councilman Jerry Lewis, and Councilwoman DeVaria Hudson Ponton.",
    source: "City of Grambling official website",
  },
  {
    title: "City clerk",
    summary:
      "Angela Harper, Municipal City Clerk, can be reached through City Hall at (318) 247-6120.",
    source: "City of Grambling official website",
  },
  {
    title: "Parish office",
    summary:
      "Lincoln Parish government is based at 100 W. Texas Ave., Ruston, LA 71270, phone (318) 251-5100.",
    source: "Lincoln Parish official website",
  },
  {
    title: "Lincoln Parish contact",
    summary: "100 W. Texas Ave., Ruston, LA 71270, phone (318) 513-6200.",
    source: "Lincoln Parish official website",
  },
  {
    title: "Louisiana elections and voting",
    summary:
      "The official Louisiana Secretary of State voter portal is the state source for voter registration, sample ballots, election dates, and candidate information.",
    source: "Louisiana Secretary of State official website",
  },
];

export function buildGramblingReferenceContext() {
  return GRAMBLING_REFERENCE_FACTS.map((item) => {
    const parts = [
      `Source: ${item.source}`,
      `Title: ${item.title}`,
      `Summary: ${item.summary}`,
    ];
    return parts.join(" | ");
  }).join("\n");
}
