import React, { useState, useMemo, useEffect, useRef, useImperativeHandle } from 'react';
import classNames from 'classnames';
import { createMachine, assign } from 'xstate';
import { useMachine } from '@xstate/react';
import { Form } from '@maif/react-forms';
import _ from 'lodash';

import { Spinner, Option } from '../utils';

export const MultiStepForm = ({
  value,
  steps,
  initial,
  creation,
  report,
  getBreadcrumb,
  save,
  labels,
}) => {
  const ref = useRef();

  useEffect(() => {
    send('RESET', { value });
  }, [value]);

  const tos = steps.reduce((acc, step) => {
    return {
      ...acc,
      [`TO_${step.id.toUpperCase()}`]: {
        target: step.id,
        actions: ['setValue'],
      },
    };
  }, {});

  const states = steps.reduce(
    (acc, step, i) => {
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
          ..._.omit(tos, `TO_${step.id.toUpperCase()}`),
          ...skipStep,
        },
      };
      return acc;
    },
    {
      save: {
        invoke: {
          id: 'save_step',
          src: (context) => {
            return (callBack, _onEvent) => {
              return save(context)
                .then((response) => {
                  if (response?.error) {
                    return callBack({ type: 'FAILURE', error: response.error });
                  }
                })
                .catch((error) => {
                  return callBack({ type: 'FAILURE', error });
                });
            };
          },
        },
        on: {
          FAILURE: {
            target: 'failure',
            actions: assign({
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
        [`guard_${step.id}`]: (context, event) => {
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
              console.debug({context, response})
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
        current.value,
        <Breadcrumb
          context={current.context}
          steps={steps}
          currentStep={current.value}
          chooseStep={(s) => send(`TO_${s}`, { value: current.context.value })}
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
    return <Spinner />;
  }
  if (current.matches('failure')) {
    return <div>{current.context.error}</div>;
  }
  const step = steps.find((s) => s.id === current.value);
  return (
    <div className="d-flex flex-column">
      <div className="d-flex flex-row flex-grow-1 col-12">
        {step.component && (
          <ComponentedForm
            reference={ref}
            value={current.context}
            valid={(response) => send('NEXT', { value: response })}
            component={step.component}
            steps={steps}
            step={step}
            initial={initial}
            send={send}
            creation={creation}
          />
        )}
        {step.schema && (
          <Form
            key={step.id}
            onSubmit={(response) => {
              send('NEXT', { value: response });
            }}
            onError={(errors, e) => console.error(errors, e)}
            schema={step.schema}
            flow={typeof step.flow === 'function' ? step.flow(current.context) : step.flow}
            ref={ref}
            value={current.context}
            footer={() => null}
          />
        )}
        {!!report && report(current.context.value, current.value)}
      </div>
      <div className="d-flex justify-content-between">
        {steps.findIndex((s) => s.id === step.id) !== 0 && (
          <button
            className="btn btn-outline-danger me-1 my-3"
            disabled={step.id === initial}
            onClick={() => send('PREVIOUS')}
          >
            {labels?.previous || 'Previous'}
          </button>
        )}
        <div className="flex-grow-1 d-flex justify-content-end my-3">
          {steps.findIndex((s) => s.id === step.id) !== steps.length - 1 && (
            <button
              className="btn btn-outline-primary me-1"
              disabled={!!creation && !step.skipTo}
              onClick={() => send('SKIP')}
            >
              {labels?.skip || 'Skip'}
            </button>
          )}
          {steps.findIndex((s) => s.id === step.id) !== steps.length - 1 && (
            <button
              className="btn btn-outline-success me-1"
              onClick={() => ref.current.handleSubmit()}
            >
              {labels?.next || 'Next'}
            </button>
          )}
          {steps.findIndex((s) => s.id === step.id) === steps.length - 1 && (
            <button
              className="btn btn-outline-success"
              onClick={() => ref.current.handleSubmit()}
            >
              {labels?.save || 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ComponentedForm = ({ value, valid, component, reference }) => {
  return (
    <div className="d-flex flex-column flex-grow-1">
      {React.createElement(component, {
        value,
        onChange: x => {
          console.debug({value, x})
          valid(x)
        },
        reference
      })}
    </div>
  );
};

const Breadcrumb = ({ steps, currentStep, chooseStep, creation, direction, context }) => {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  const handleChooseStep = (idx, disabled) => {
    if (!disabled && (!creation || idx < currentIdx)) {
      chooseStep(steps[idx].id.toUpperCase());
    }
  };

  return (
    <div
      className={classNames('d-flex steps', {
        'flex-column': direction === 'vertical',
        'flex-row': direction !== 'vertical',
      })}
    >
      {steps.map((step, idx) => {
        const disabled = Option(step.disabled)
          .map((d) => (typeof d === 'function' ? d(context) : d))
          .getOrElse(false);
        return (
          <div
            className={classNames('step d-flex cursor-pointer ', {
              active: currentIdx === idx,
              finished: currentIdx > idx,
              wait: currentIdx < idx,
              'cursor-forbidden': disabled || (creation && idx > currentIdx),
            })}
            key={idx}
            onClick={() => handleChooseStep(idx, disabled)}
          >
            <div className="step-content">{step.label}</div>
          </div>
        );
      })}
    </div>
  );
};
