type DemandStep = {
  state: string;
  step: {
    name: string;
  };
};

export const findCurrentStep = <Step extends DemandStep>(steps: Array<Step>) =>
  steps.find((demandStep) => demandStep.state === 'inProgress' || demandStep.state === 'waiting');

export const isWaitingForPayment = (steps: Array<DemandStep>) =>
  findCurrentStep(steps)?.step.name === 'payment';
