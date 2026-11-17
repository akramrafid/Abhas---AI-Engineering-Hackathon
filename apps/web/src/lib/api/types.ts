import type { components } from "./schema";

export type AskRequest = components["schemas"]["AskRequest"];
export type AskResponse = components["schemas"]["AskResponse"];
export type ChatTurn = components["schemas"]["ChatTurn"];
export type Citation = components["schemas"]["Citation"];

export type DocumentSummary = components["schemas"]["DocumentSummary"];
export type DocumentDetail = components["schemas"]["DocumentDetail"];
export type IndexResult = components["schemas"]["IndexResult"];

export type Category = components["schemas"]["Category"];
export type Urgency = components["schemas"]["Urgency"];
export type Sentiment = components["schemas"]["Sentiment"];
export type Language = components["schemas"]["Language"];
export type Usage = components["schemas"]["Usage"];

export type TriageRequest = components["schemas"]["TriageRequest"];
export type TriageResult = components["schemas"]["TriageResult"];
export type TriageHistoryItem = components["schemas"]["TriageHistoryItem"];
export type BatchTriageItem = components["schemas"]["BatchTriageItem"];
export type BatchTriageResult = components["schemas"]["BatchTriageResult"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

export interface SampleTicket {
  id: string;
  channel: "email" | "chat" | "app" | "phone";
  text: string;
  label_category: Category;
  label_urgency: Urgency;
  label_language: Language;
  label_needs_human: boolean;
  label_injection: boolean;
}
