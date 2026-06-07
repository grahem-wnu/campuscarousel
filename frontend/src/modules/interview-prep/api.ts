// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type {
  AnswerResponse,
  BankQuestion,
  Category,
  Interview,
  InterviewInput,
  InterviewType,
  MockSession,
} from './types';

export async function listInterviews(type?: InterviewType): Promise<Interview[]> {
  const res = await api.get<{ interviews: Interview[] }>('/interviews', { query: { type } });
  return res.interviews;
}

export function getInterview(id: string): Promise<Interview> {
  return api.get<Interview>(`/interviews/${encodeURIComponent(id)}`);
}

export function createInterview(input: InterviewInput): Promise<Interview> {
  return api.post<Interview>('/interviews', input);
}

export function updateInterview(id: string, patch: Partial<InterviewInput>): Promise<Interview> {
  return api.put<Interview>(`/interviews/${encodeURIComponent(id)}`, patch);
}

export function deleteInterview(id: string): Promise<void> {
  return api.del<void>(`/interviews/${encodeURIComponent(id)}`);
}

export function startMock(opts: { school?: string; collegeId?: string; count?: number } = {}): Promise<MockSession> {
  return api.post<MockSession>('/interviews/mock', opts);
}

export function submitAnswer(sessionId: string, questionIndex: number, answer: string): Promise<AnswerResponse> {
  return api.post<AnswerResponse>(`/interviews/mock/${encodeURIComponent(sessionId)}/answer`, { questionIndex, answer });
}

export async function listQuestions(opts: { category?: Category; search?: string } = {}): Promise<BankQuestion[]> {
  const res = await api.get<{ questions: BankQuestion[] }>('/interviews/questions', { query: opts });
  return res.questions;
}

export function addQuestion(question: string, category?: Category, starred?: boolean): Promise<BankQuestion> {
  return api.post<BankQuestion>('/interviews/questions', { question, category, starred });
}
