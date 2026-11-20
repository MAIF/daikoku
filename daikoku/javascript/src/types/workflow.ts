import type { IValidationStep } from './api';

export type IWorkflowState =
  'accepted' | 'refused' | 'canceled' | 'inProgress' | 'waiting' | 'blocked';

export interface WorkflowStep {
  id: string;
  state: IWorkflowState;
  step: IValidationStep;
  metadata: object;
}
