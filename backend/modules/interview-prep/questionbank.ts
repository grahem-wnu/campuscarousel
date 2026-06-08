// Curated BSN interview question bank — common knowledge/behavioral/situational questions every
// nursing applicant should rehearse. Served by GET /interviews/questions (filterable) and used as the
// deterministic fallback when the AI question generator is unavailable. Custom questions a user adds
// are merged on top by the handler.

import type { QUESTION_CATEGORIES } from './schema.js';

export type Category = (typeof QUESTION_CATEGORIES)[number];

export interface BankQuestion {
  id: string;
  question: string;
  category: Category;
  /** Curated must-prepare flag; user-added questions can also be starred. */
  starred?: boolean;
}

export const QUESTION_BANK: BankQuestion[] = [
  { id: 'q-why-nursing', category: 'motivation', starred: true, question: 'Why do you want to become a nurse?' },
  { id: 'q-why-this-school', category: 'school-specific', starred: true, question: 'Why our nursing program specifically?' },
  { id: 'q-strength-weakness', category: 'general', question: 'What is your greatest strength, and one area you are working to improve?' },
  { id: 'q-handle-stress', category: 'situational', question: 'Nursing is high-pressure. How do you handle stress and stay organized?' },
  { id: 'q-difficult-patient', category: 'situational', question: 'How would you handle a frightened or uncooperative patient?' },
  { id: 'q-teamwork', category: 'behavioral', starred: true, question: 'Tell me about a time you worked on a team to solve a problem.' },
  { id: 'q-failure', category: 'behavioral', question: 'Describe a time you failed or made a mistake. What did you learn?' },
  { id: 'q-leadership', category: 'behavioral', question: 'Give an example of when you took initiative or led others.' },
  { id: 'q-compassion', category: 'clinical', starred: true, question: 'Describe a moment that showed you have compassion for others.' },
  { id: 'q-clinical-exposure', category: 'clinical', question: 'What healthcare or clinical experience have you had, and what did it teach you?' },
  { id: 'q-ethical', category: 'ethics', question: 'You see a classmate cheating. What do you do, and why?' },
  { id: 'q-patient-confidentiality', category: 'ethics', question: 'What does patient confidentiality mean to you?' },
  { id: 'q-five-years', category: 'motivation', question: 'Where do you see yourself in five years as a nurse?' },
  { id: 'q-icu-interest', category: 'motivation', question: 'What draws you to a specialty like ICU or critical care?' },
  { id: 'q-diversity', category: 'situational', question: 'How would you care for a patient whose background or beliefs differ from yours?' },
  { id: 'q-questions-for-us', category: 'general', question: 'What questions do you have for us about the program?' },
];

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/** Filter the bank by category and/or free-text search. */
export function filterBank(
  questions: readonly BankQuestion[],
  opts: { category?: Category; search?: string } = {},
): BankQuestion[] {
  const needle = norm(opts.search);
  return questions.filter((q) => {
    if (opts.category && q.category !== opts.category) return false;
    if (needle && !norm(q.question).includes(needle)) return false;
    return true;
  });
}
