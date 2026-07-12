import { api } from "../../shared/api";
import type { FocusOverview, FocusResponse } from "./types";

/** The resolved pack(s) + cached overview for the active student. Scoped to X-Student-Id. */
export function getFocus(): Promise<FocusResponse> {
  return api.get<FocusResponse>("/focus");
}

/** Kick off (or refresh) the web-grounded overview on the async worker; returns the pending state. */
export function refreshOverview(): Promise<FocusOverview> {
  return api.post<FocusOverview>("/focus/overview", {});
}

/** Kick off (or refresh) the web-grounded career path from the free-text career goal. */
export function refreshCareerPath(): Promise<FocusOverview> {
  return api.post<FocusOverview>("/focus/career-path", {});
}
