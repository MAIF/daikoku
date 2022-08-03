import React, { useMemo, useEffect, useRef } from 'react';
import { createMachine, assign } from 'xstate';
import { useMachine } from '@xstate/react';
import { Form } from '@maif/react-forms';
import omit from 'lodash/omit';
import { Steps, Popover } from 'antd';

const { Step } = Steps;

import { Spinner, Option } from '../utils';

const customDot = (dot: any, {
  status,
  index
}: any) => (
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <Popover
    content={
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <span>
        step {index} status: {status}
      </span>
    }
  >
    {dot}
  </Popover>
);

export const MultiStepForm = ({
  value,
  steps,
  initial,
  creation,
  report,
  getBreadcrumb,
  save,
  labels
}: any) => {
  const ref = useRef();

  useEffect(() => {
    send('RESET', { value });
  }, [value]);

  const tos = steps.reduce((acc: any, step: any) => {
    return {
      ...acc,
      [`TO_${step.id.toUpperCase()}`]: {
        target: step.id,
        actions: ['setValue'],
      },
    };
  }, {});

  const states = steps.reduce(
    (acc: any, step: any, i: any) => {
      const nextStep = steps[i + 1];
      const previousStep = steps[i - 1];
      const skipStep =
        !!step.skipTo || !creation
          ? {
              SKIP: {
                target: step.skipTo || (nextStep ? nextStep.id : 'save'),
              },
            }
          : {};
      const previousStepObj = previousStep
        ? {
            PREVIOUS: {
              target: previousStep ? previousStep.id : null,
            },
          }
        : {};

      const disableStep = !!step.disabled
        ? {
            always: [{ target: nextStep ? nextStep.id : 'save', cond: `guard_${step.id}` }],
          }
        : {};

      acc[step.id] = {
        ...disableStep,
        on: {
          NEXT: {
            target: nextStep ? nextStep.id : 'save',
            actions: ['setValue'],
          },
          RESET: {
            target: initial,
            actions: ['reset'],
          },
          ...previousStepObj,
          ...omit(tos, `TO_${step.id.toUpperCase()}`),
          ...skipStep,
        },
      };
      return acc;
    },
    {
      save: {
        invoke: {
          id: 'save_step',
          src: (context: any) => {
            return (callBack: any, _onEvent: any) => {
              return save(context)
                .then((response: any) => {
                  if (response?.error) {
                    return callBack({ type: 'FAILURE', error: response.error });
                  }
                })
                .catch((error: any) => {
                  return callBack({ type: 'FAILURE', error });
                });
            };
          },
        },
        on: {
          FAILURE: {
            target: 'failure',
            actions: assign({
              // @ts-expect-error TS(2339): Property 'error' does not exist on type 'EventObje... Remove this comment to see the full error message
              error: (_context, { error }) => error,
            }),
          },
          RESET: {
            target: initial,
            actions: ['reset'],
          },
        },
      },
      failure: { type: 'final' },
    }
  );

  const guards = steps
    .filter((s: any) => !!s.disabled)
    .reduce((acc: any, step: any) => {
      return {
        ...acc,
        [`guard_${step.id}`]: (context: any, event: any) => {
          if (typeof step.disabled === 'function') {
            return step.disabled(context);
          } else {
            return !!step.disabled;
          }
        },
      };
    }, {});
  const machine = useMemo(
    () =>
      createMachine(
        {
          id: 'foo',
          context: value,
          initial,
          states,
        },
        {
          guards,
          actions: {
            setValue: assign((context, response) => {
              return { ...context, ...(response as any).value };
            }),
            reset: assign((_, response) => {
              return { ...(response as any).value };
            }),
          },
        }
      ),
    []
  );

  const [current, send] = useMachine(machine);

  useEffect(() => {
    if (!!getBreadcrumb) {
      getBreadcrumb(
        current.value,
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Breadcrumb
          context={current.context}
          steps={steps}
          currentStep={current.value}
          chooseStep={(s: any) => send(`TO_${s}`, { value: current.context.value })}
          creation={creation}
          direction="vertical"
        />
      );
    }

    return () => {
      if (!!getBreadcrumb) {
        getBreadcrumb(null);
      }
    };
  }, [current.value]);

  if (current.matches('save')) {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <Spinner />;
  }
  if (current.matches('failure')) {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <div>{current.context.error}</div>;
  }
  const step = steps.find((s: any) => s.id === current.value);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-column">
      {!getBreadcrumb && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="my-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Breadcrumb
            context={current.context}
            steps={steps}
            currentStep={current.value}
            chooseStep={(s: any) => send(`TO_${s}`, { value: current.context.value })}
            creation={creation}
            direction="horizontal"
          />
        </div>
      )}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-row flex-grow-1 col-12">
        {step.component && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <ComponentedForm
            reference={ref}
            value={current.context}
            valid={(response: any) => send('NEXT', { value: response })}
            component={step.component}
            steps={steps}
            step={step}
            initial={initial}
            send={send}
            creation={creation}
          />
        )}
        {step.schema && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Form
            key={step.id}
            onSubmit={(response) => {
              send('NEXT', { value: response });
            }}
            // @ts-expect-error TS(2322): Type '(errors: any, e: any) => void' is not assign... Remove this comment to see the full error message
            onError={(errors: any, e: any) => console.error(errors, e)}
            schema={step.schema}
            flow={typeof step.flow === 'function' ? step.flow(current.context) : step.flow}
            ref={ref}
            value={current.context}
            // @ts-expect-error TS(2322): Type '() => null' is not assignable to type '(prop... Remove this comment to see the full error message
            footer={() => null}
          />
        )}
        {!!report && report(current.context.value, current.value)}
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex justify-content-between">
        {steps.findIndex((s: any) => s.id === step.id) !== 0 && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <button
            className="btn btn-outline-danger me-1 my-3"
            disabled={step.id === initial}
            onClick={() => send('PREVIOUS')}
          >
            {labels?.previous || 'Previous'}
          </button>
        )}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="flex-grow-1 d-flex justify-content-end my-3">
          {steps.findIndex((s: any) => s.id === step.id) !== steps.length - 1 && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button
              className="btn btn-outline-primary me-1"
              disabled={!!creation && !step.skipTo}
              onClick={() => send('SKIP')}
            >
              {labels?.skip || 'Skip'}
            </button>
          )}
          {steps.findIndex((s: any) => s.id === step.id) !== steps.length - 1 && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button
              className="btn btn-outline-success me-1"
              // @ts-expect-error TS(2532): Object is possibly 'undefined'.
              onClick={() => ref.current.handleSubmit()}
            >
              {labels?.next || 'Next'}
            </button>
          )}
          {steps.findIndex((s: any) => s.id === step.id) === steps.length - 1 && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button className="btn btn-outline-success" onClick={() => ref.current.handleSubmit()}>
              {labels?.save || 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ComponentedForm = ({
  value,
  valid,
  component,
  reference
}: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-column flex-grow-1">
      {React.createElement(component, {
        value,
        onChange: (x: any) => valid(x),
        reference,
      })}
    </div>
  );
};

const Breadcrumb = ({
  steps,
  currentStep,
  chooseStep,
  creation,
  direction,
  context
}: any) => {
  const currentIdx = steps.findIndex((s: any) => s.id === currentStep);

  const handleChooseStep = (idx: any) => {
    const disabled = Option(steps[idx])
      .map((step: any) => step.disabled)
      .map((d: any) => typeof d === 'function' ? d(context) : d)
      .getOrElse(false);
    if (!disabled && (!creation || idx < currentIdx)) {
      chooseStep(steps[idx].id.toUpperCase());
    }
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Steps
      direction={direction}
      current={currentIdx}
      progressDot={customDot}
      onChange={(idx) => handleChooseStep(idx)}
    >
      {steps.map((step: any, idx: any) => {
        const disabled = Option(step.disabled)
          .map((d: any) => typeof d === 'function' ? d(context) : d)
          .getOrElse(false);
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        return <Step title={step.label} disabled={disabled || (creation && idx > currentIdx)} />;
      })}
    </Steps>
  );
};
