import { Form, FormRef, Schema } from '@maif/react-forms';
import { useMachine } from '@xstate/react';
import { Popover, Steps, ConfigProvider } from 'antd';
import omit from 'lodash/omit';
import React, { useEffect, useMemo, useRef } from 'react';
import { assign, createMachine } from 'xstate';

const { Step } = Steps;

import { Option, Spinner } from '../utils';
import { ITeamSimple } from '../../types';

const customDot = (dot, {
  status,
  index
}) => (
  <Popover
    content={
      <span>
        step {index} status: {status}
      </span>
    }
  >
    {dot}
  </Popover>
);

export interface IMultistepsformStep<T> {
  id: string
  label: string
  flow?: any | ((data: T) => any)
  schema?: Schema | ((data?: T) => Schema)
  component?: JSX.Element | ((p: T) => JSX.Element)
  skipTo?: string
  disabled?: boolean | ((p: T) => boolean)
}

export const MultiStepForm = <T extends object>({
  value,
  steps,
  initial,
  creation = false,
  getBreadcrumb,
  save,
  labels,
  currentTeam
}: {
  value?: T,
  steps: Array<IMultistepsformStep<T>>,
  initial: string,
  creation: boolean,
  getBreadcrumb?: (value?: T, element?: JSX.Element) => any,
  save: (x: T) => Promise<any>,
  labels: any,
  currentTeam?: ITeamSimple
}) => {
  const ref = useRef<FormRef>();

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
    (acc: any, step, i) => {
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
          src: (context: T) => {
            return (callBack, _onEvent) => {
              return save(context)
                .then((response) => {
                  if (response?.error) {
                    return callBack({ type: 'FAILURE', error: response.error });
                  } else {
                    callBack({ type: 'SUCCESS' })
                  }
                })
                .catch((error) => {
                  return callBack({ type: 'FAILURE', error });
                });
            };
          },
        },
        on: {
          SUCCESS: {
            target: initial
          },
          FAILURE: {
            target: 'failure',
            actions: assign({ //@ts-ignore //FIXME ts & xstate ??
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
    .filter((s) => !!s.disabled)
    .reduce((acc, step) => {
      return {
        ...acc,
        [`guard_${step.id}`]: (context) => {
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
      createMachine<T>(
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
              return { ...context, ...response.value };
            }),
            reset: assign((_, response) => {
              return { ...response.value };
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
        current.context,
        <Breadcrumb
          context={current.context}
          steps={steps}
          currentStep={current.value as string}
          chooseStep={(s) => send(`TO_${s}`, current.context)}
          creation={creation}
          direction="vertical"
        />
      );
    }

    return () => {
      if (!!getBreadcrumb) {
        getBreadcrumb();
      }
    };
  }, [current.value]);

  if (current.matches('save')) {
    return <Spinner />;
  }
  if (current.matches('failure')) {
    // return <div>{current.context.error}</div>;
  }
  const step = steps.find((s) => s.id === current.value);
  if (!step) {
    return null; //todo ???
  }
  return (
    <div className="d-flex flex-column">
      {!getBreadcrumb && (
        <div className="my-3">
          <Breadcrumb
            context={current.context}
            steps={steps}
            currentStep={current.value as string}
            chooseStep={(s) => send(`TO_${s}`, { value: current.context })}
            creation={creation}
            direction="horizontal"
          />
        </div>
      )}
      <div className="d-flex flex-row flex-grow-1 col-12">
        {step.component && (
          <ComponentedForm
            reference={ref}
            value={current.context}
            valid={(value) => {
              send('NEXT', { value })
            }}
            component={step.component}
            currentTeam={currentTeam}
          />
        )}
        {step.schema && (
          <Form<T>
            key={step.id}
            onSubmit={(value) => {
              send('NEXT', { value });
            }}
            onError={(errors, e) => console.error(errors, e)}
            schema={typeof step.schema === 'function' ? step.schema(current.context) : step.schema}
            flow={typeof step.flow === 'function' ? step.flow(current.context) : step.flow}
            ref={ref}
            value={current.context}
            footer={() => <></>}
          />
        )}
      </div>
      <div className="d-flex justify-content-between">
        {steps.findIndex((s) => s.id === step.id) !== 0 && (
          <button
            className="btn btn-outline-danger me-1 my-3"
            onClick={() => send('PREVIOUS')}
          >
            {labels?.previous || 'Previous'}
          </button>
        )}
        <div className="flex-grow-1 d-flex justify-content-end my-3">
          {steps.findIndex((s) => s.id === step.id) !== steps.length - 1 && !!step.skipTo && (
            <button
              className="btn btn-outline-info me-1"
              disabled={!!creation || !step.skipTo}
              onClick={() => send('SKIP')}
            >
              {labels?.skip || 'Skip'}
            </button>
          )}
          {steps.findIndex((s) => s.id === step.id) !== steps.length - 1 && (
            <button
              className="btn btn-outline-success me-1"
              onClick={() => ref.current?.handleSubmit()}
            >
              {labels?.next || 'Next'}
            </button>
          )}
          {steps.findIndex((s) => s.id === step.id) === steps.length - 1 && (
            <button className="btn btn-outline-success" onClick={() => ref.current?.handleSubmit()}>
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
  reference,
  currentTeam
}) => {
  return (
    <div className="d-flex flex-column flex-grow-1">
      {React.createElement(component, {
        value,
        onChange: (x) => valid(x),
        reference,
        currentTeam
      })}
    </div>
  );
};

const Breadcrumb = <T,>({
  steps,
  currentStep,
  chooseStep,
  creation,
  direction,
  context
}: {
  steps: Array<IMultistepsformStep<T>>,
  currentStep: string,
  chooseStep: (idx: string) => void,
  creation: boolean,
  direction?: 'vertical' | 'horizontal',
  context: T
}) => {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  const handleChooseStep = (idx: number) => {
    const disabled = Option(steps[idx])
      .map((step) => step.disabled)
      .map((d) => typeof d === 'function' ? d(context) : d)
      .getOrElse(false);
    if (!disabled && (!creation || idx < currentIdx)) {
      chooseStep(steps[idx].id.toUpperCase());
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: 'var(--success-color, red)',
          colorInfo: 'var(--success-color, red)',
          colorTextBase: 'var(--success-color, red)'
        }
      }}
    >
      <Steps
        direction={direction}
        current={currentIdx}
        progressDot={customDot}
        onChange={(idx) => handleChooseStep(idx)}
        items={steps.map((step, idx: number) => {
          const disabled = Option(step.disabled)
            .map((d: boolean | ((p: any) => boolean)) => typeof d === 'function' ? d(context) : d)
            .getOrElse(false);

          return { title: step.label, disabled: disabled || (creation && idx > currentIdx) }
        })}
      >

      </Steps>
    </ConfigProvider>
  );
};
