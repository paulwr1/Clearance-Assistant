export type CaseKey = 'archivieren' | 'nicht-archivieren' | 'doppelt' | 'in-bearbeitung' | 'unklar';
export type Tone = 'success' | 'danger' | 'warning' | 'info';

export interface CaseType {
  key: CaseKey;
  title: string;
  description: string;
  tone: Tone;
  reasons: string[];
}

export interface FieldInfo {
  label: string;
  value?: string;
  source: string;
}

export interface ReplySuggestion {
  needed: boolean;
  note: string;
  text: string;
}

export interface AnalysisResult {
  caseType: CaseType;
  ticketNumber: string | null;
  present: FieldInfo[];
  missing: FieldInfo[];
  steps: string[];
  reply: ReplySuggestion;
}