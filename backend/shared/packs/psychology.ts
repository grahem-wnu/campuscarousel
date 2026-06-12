// Psychology pack — the undergrad anchor for the whole mental-health field. Covers the path to
// becoming a psychiatrist (Psychology + pre-med prerequisites → MCAT → medical school → psychiatry
// residency), as well as clinical psychology (PhD/PsyD), counseling, and social work. No college
// entrance exam; research, statistics, GPA, and clinical/volunteer hours lead. The 'psychiatry'/
// 'psychiatrist' aliases route a "psychiatry" interest here rather than to a redundant pre-med pack.

import type { MajorPack } from './types.js';

export const psychologyPack: MajorPack = {
  key: 'psychology',
  label: 'Psychology',
  aliases: ['psychology', 'psych', 'psychiatry', 'psychiatrist', 'behavioral science', 'mental health', 'counseling', 'social work'],
  focusBrief:
    'This student is pursuing Psychology / the mental-health field. Emphasize a strong GPA, statistics and ' +
    'research-methods coursework, undergraduate research with a faculty lab, and clinical/volunteer hours ' +
    '(crisis lines, peer support, shelters). If their goal is to become a PSYCHIATRIST, note that requires ' +
    'the pre-med science prerequisites (biology, chemistry, organic chemistry, physics) + the MCAT and ' +
    'medical school after the degree; clinical psychology and counseling are graduate (PhD/PsyD/master’s) ' +
    'paths. For college, focus on rigor, research, and hands-on mental-health experience.',
  certifications: [
    { name: 'Mental Health First Aid', issuingOrganization: 'National Council for Mental Wellbeing', why: 'Teaches how to recognize and respond to mental-health and substance-use crises — directly relevant and accessible to teens.', priority: 1 },
    { name: 'QPR Gatekeeper (Question, Persuade, Refer)', issuingOrganization: 'QPR Institute', why: 'Short suicide-prevention training that shows real commitment to mental-health work.', priority: 2 },
    { name: 'Basic Life Support (BLS)', issuingOrganization: 'American Heart Association', why: 'Baseline for clinical/volunteer placements and any pre-med (psychiatry) track.', priority: 3 },
  ],
  interviewQuestions: [
    'Why psychology / the mental-health field?',
    'Describe a time you supported someone through a hard moment. What did you learn?',
    'How do you set boundaries and take care of your own wellbeing?',
    'What ethical responsibilities come with working in mental health (confidentiality, scope)?',
  ],
  visitQuestions: [
    'What undergraduate research labs exist, and how early can students join one?',
    'Is there a BA vs BS track, and pre-med advising for psychiatry-bound students?',
    'What practicum, internship, or field-placement opportunities are available?',
    'How do students do on graduate / professional-school placement?',
  ],
  programDetailsHint:
    'Capture psychology specifics: undergraduate research lab access, BA vs BS tracks, pre-med advising for ' +
    'psychiatry-bound students, practicum/internship/field placements, and graduate-school placement.',
};
