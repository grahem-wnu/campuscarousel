import { describe, expect, it } from 'vitest';
import type { Activity, Contact, Goal } from '../../shared/data/index.js';
import { buildBriefPrompt, makeBriefer, unavailableBriefer } from './briefs.js';

const contact: Contact = {
  contactId: 'c1',
  name: 'Mr. Chu',
  role: 'AP Bio teacher',
  organization: 'Mission HS',
  relationship: 'teacher',
  createdAt: '',
  updatedAt: '',
};

const sources = {
  activities: [
    { activityId: 'a', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'CHOC volunteering', description: 'pediatric unit', visibility: 'family', createdAt: '', updatedAt: '' },
  ] as Activity[],
  goals: [{ goalId: 'g', title: 'Reach 100 clinical hours', createdAt: '', updatedAt: '' } as Goal],
};

describe('buildBriefPrompt', () => {
  it('names the recommender and includes the activities/goals, demanding no invented facts', () => {
    const p = buildBriefPrompt(contact, sources, 'leadership');
    expect(p).toContain('Mr. Chu');
    expect(p).toContain('AP Bio teacher');
    expect(p).toContain('Emphasis: leadership.');
    expect(p).toContain('CHOC volunteering');
    expect(p).toContain('Reach 100 clinical hours');
    expect(p).toContain('Do not invent facts');
  });

  it('is major-aware: names the major and folds in pack guidance', () => {
    const p = buildBriefPrompt(contact, sources, undefined, ['Nursing']);
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('stays neutral with no majors', () => {
    const p = buildBriefPrompt(contact, sources);
    expect(p).toContain('their intended college programs');
    expect(p).not.toContain('Major-specific guidance:');
  });
});

describe('makeBriefer', () => {
  it('returns the trimmed brief on success', async () => {
    const b = makeBriefer(async () => '  A strong brief.  ');
    expect(await b.brief(contact, sources)).toBe('A strong brief.');
  });
  it('502s on an empty model reply', async () => {
    const b = makeBriefer(async () => '   ');
    await expect(b.brief(contact, sources)).rejects.toMatchObject({ status: 502 });
  });
  it('502s on an invoker failure', async () => {
    const b = makeBriefer(async () => {
      throw new Error('bedrock down');
    });
    await expect(b.brief(contact, sources)).rejects.toMatchObject({ status: 502 });
  });
});

describe('unavailableBriefer', () => {
  it('rejects with a 503', async () => {
    await expect(unavailableBriefer.brief(contact, sources)).rejects.toMatchObject({ status: 503 });
  });
});
