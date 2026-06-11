// Computer Science pack. No major-specific entrance exam (unlike nursing's TEAS) — CS admissions hinge
// on a project portfolio, not a standardized test — so `entranceExam` is intentionally omitted.

import type { MajorPack } from './types.js';

export const computerSciencePack: MajorPack = {
  key: 'computer-science',
  label: 'Computer Science',
  aliases: ['computer science', 'cs', 'compsci', 'comp sci', 'software', 'computing'],
  focusBrief:
    'This student is pursuing computer science. Emphasize a tangible project portfolio (GitHub, apps, ' +
    'games, hackathons), a strong math track (through calculus), internships or open-source contributions, ' +
    'and competition activity (USACO, robotics). Note that CS is an impacted/competitive major at many ' +
    'schools — flag whether admission is direct-to-major or a competitive internal application.',
  certifications: [
    { name: 'CS50x Certificate (HarvardX)', issuingOrganization: 'HarvardX (edX)', why: 'A rigorous, free intro that signals real CS foundations and gives portfolio projects.', priority: 2 },
    { name: 'AWS Certified Cloud Practitioner', issuingOrganization: 'Amazon Web Services', why: 'Attainable in high school; shows initiative with real cloud/industry tooling.', priority: 3 },
  ],
  interviewQuestions: [
    'Why computer science?',
    'Tell me about a project you built — what was hard, and how did you solve it?',
    'Describe a bug or problem you were stuck on and how you worked through it.',
    'What area of tech excites you most, and why?',
  ],
  visitQuestions: [
    'Is CS a direct-admit major here, or a competitive internal application after first year?',
    'What is the intro CS sequence and primary language?',
    'What undergraduate research, labs, or open-source opportunities exist?',
    'How strong is internship / co-op placement, and which companies recruit here?',
    'What are class sizes for the core CS courses?',
  ],
  programDetailsHint:
    'Capture CS-program specifics: whether CS is direct-admit or an impacted/competitive major, the intro ' +
    'language/sequence, internship/co-op placement strength and top recruiters, and notable research areas or labs.',
};
