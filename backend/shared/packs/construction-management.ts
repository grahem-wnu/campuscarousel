// Construction Management pack — managing building projects (estimating, scheduling, contracts, safety,
// reading plans), distinct from the design-and-math focus of the general Engineering pack. No college
// entrance exam; internships/co-ops with contractors, OSHA safety certs, and jobsite experience lead.

import type { MajorPack } from './types.js';

export const constructionManagementPack: MajorPack = {
  key: 'construction-management',
  label: 'Construction Management',
  aliases: ['construction', 'construction management', 'building construction', 'construction science', 'built environment', 'building science'],
  focusBrief:
    'This student is pursuing Construction Management — running building projects (estimating, scheduling, ' +
    'budgeting, contracts, safety, and reading plans), as opposed to the structural-design math of civil ' +
    'engineering. Emphasize summer internships / co-ops with general contractors, OSHA safety certifications, ' +
    'hands-on jobsite or trades experience, leadership, and choosing an ACCE-accredited program. Strong ' +
    'programs feed directly into paid internships and high job-placement rates.',
  experienceLabel: 'Internship / jobsite hours',
  experienceTerms: {
    placeLabel: 'Site / company',
    placePlaceholder: 'e.g. Turner Construction',
    departmentPlaceholder: 'e.g. field, estimating, safety',
    dutiesPlaceholder: 'e.g. reading plans, site walks, scheduling, take-offs',
  },
  certifications: [
    { name: 'OSHA 30-Hour Construction', issuingOrganization: 'OSHA / authorized trainer', why: 'The safety credential general contractors expect — a standout on a high-schooler’s résumé and often required on jobsites.', priority: 1 },
    { name: 'OSHA 10-Hour Construction', issuingOrganization: 'OSHA / authorized trainer', why: 'The entry-level safety card; a fast first step before the 30-hour.', priority: 2 },
    { name: 'First Aid / CPR', issuingOrganization: 'American Red Cross / AHA', why: 'Expected for jobsite work and easy to earn early.', priority: 3 },
    { name: 'LEED Green Associate', issuingOrganization: 'U.S. Green Building Council', why: 'Signals sustainable-building knowledge that modern firms value.', priority: 4 },
  ],
  interviewQuestions: [
    'Why construction management rather than engineering or the trades?',
    'Describe a time you led a team or organized a project from start to finish.',
    'How would you respond if a project fell behind schedule or you spotted a safety hazard?',
    'What hands-on building, trades, or plan-reading experience do you have?',
  ],
  visitQuestions: [
    'Is the program ACCE-accredited, and what is its job-placement rate and starting salary?',
    'What is the co-op / internship pipeline with general contractors?',
    'What hands-on labs, yards, or BIM / estimating software do students use?',
    'Is there an AGC or ABC student chapter and a student competition team?',
  ],
  programDetailsHint:
    'Capture construction-management specifics: ACCE accreditation, co-op/internship pipeline with ' +
    'contractors, hands-on labs / BIM & estimating software, AGC/ABC student chapters and competitions, ' +
    'and job-placement rate & starting salary.',
};
