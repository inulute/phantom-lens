// types/processing.ts
export interface ProcessingEvents {
  INITIAL_START: string;
  RESPONSE_SUCCESS: string;
  RESPONSE_ERROR: string;
  RESPONSE_CHUNK: string;
  FOLLOWUP_START: string;
  FOLLOWUP_SUCCESS: string;
  FOLLOWUP_ERROR: string;
  FOLLOWUP_CHUNK: string;
  API_KEY_INVALID: string;
  RESET: string;
}

export interface TaskResponseData {
  response: string;
  isFollowUp?: boolean;
}

export * from './processing';