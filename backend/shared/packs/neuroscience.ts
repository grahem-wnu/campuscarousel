// Neuroscience pack — the brain/behavior science route (distinct from Psychology's clinical focus).
// Heavy biology/chemistry/statistics + laboratory research; leads into research (PhD), medicine
// (pre-med), or industry. No college entrance exam; undergraduate research and quantitative skill lead.

import type { MajorPack } from './types.js';

export const neurosciencePack: MajorPack = {
  key: 'neuroscience',
  label: 'Neuroscience',
  aliases: ['neuroscience', 'cognitive science', 'behavioral neuroscience', 'neurobiology'],
  focusBrief:
    'This student is pursuing Neuroscience. Emphasize rigor in biology, chemistry, and statistics, early and ' +
    'sustained undergraduate research in a faculty lab, lab technique, and quantitative/coding skill (data ' +
    'analysis, basic programming). The field branches into research (PhD), medicine (pre-med prerequisites + ' +
    'MCAT later), and industry (biotech/neurotech). For college, prioritize research access and a strong ' +
    'science-and-math foundation.',
  certifications: [
    { name: 'CITI Human Subjects Research Training', issuingOrganization: 'CITI Program', why: 'Required to work in labs that run human studies — shows readiness to join research early.', priority: 1 },
    { name: 'Basic Life Support (BLS)', issuingOrganization: 'American Heart Association', why: 'Baseline for clinical research settings and any pre-med track.', priority: 2 },
    { name: 'Bloodborne Pathogens / Lab Safety', issuingOrganization: 'OSHA-aligned provider', why: 'A common prerequisite for wet-lab and clinical research placements.', priority: 3 },
  ],
  interviewQuestions: [
    'Why neuroscience, and what questions about the brain or behavior fascinate you?',
    'Describe any research, lab, or independent-investigation experience.',
    'How comfortable are you with statistics and coding, and how are you building those skills?',
    'What ethical questions come up in brain / behavioral research?',
  ],
  visitQuestions: [
    'What undergraduate research labs exist (cellular, cognitive, computational), and how early can students join?',
    'Can undergraduates co-author publications or present at conferences?',
    'Is research funded (work-study, stipends) or for credit?',
    'How do students place into graduate programs and medical school?',
  ],
  programDetailsHint:
    'Capture neuroscience specifics: breadth of research labs (cellular / cognitive / computational), ' +
    'undergraduate research funding, publication/co-author and conference opportunities, and graduate / ' +
    'medical-school placement.',
};
