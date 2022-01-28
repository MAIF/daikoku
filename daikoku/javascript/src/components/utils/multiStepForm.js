import React, { useState, useMemo, useEffect, useRef, useImperativeHandle } from 'react';
import classNames from 'classnames';
import { createMachine, assign } from 'xstate';
import { useMachine } from "@xstate/react";
import { Form } from '@maif/react-forms';
import _ from 'lodash';

import { Spinner } from '../utils';

export const MultiStepForm = ({ value, steps, initial, creation, report, getBreadcrumb, save }) => {
  const ref = useRef();

  const tos = steps.reduce((acc, step) => {
    return {
      ...acc,
      [`TO_${step.id.toUpperCase()}`]: {
        target: step.id,
        actions: ['setValue']
      }
    }
  }, {})

  const states = steps.reduce((acc, step, i) => {
    const nextStep = steps[i + 1];
    const previousStep = steps[i - 1];
    const skipStep = !!step.skipTo ? {
      SKIP: {
        target: step.skipTo
      }
    } : {}
    const previousStepObj = previousStep ? {
      PREVIOUS: {
        target: previousStep ? previousStep.id : null,
      }
    } : {}


    acc[step.id] = {
      on: {
        NEXT: {
          target: nextStep ? nextStep.id : 'save',
          actions: ['setValue']
        },
        ...previousStepObj,
        ..._.omit(tos, `TO_${step.id.toUpperCase()}`),
        ...skipStep
      }
    };
    return acc;
  }, {
    save: {
      invoke: {
        id: 'save_step',
        src: (context) => {
          return (callBack, _onEvent) => {
            return save(context)
              .then(response => {
                if (response.error) {
                  console.debug({ response })
                  return callBack({ type: 'FAILURE', error: response.error })
                } else {
                  return callBack({ type: 'DONE' })
                }
              })
              .catch((error) => {
                console.debug({ error })
                return callBack({ type: 'FAILURE', error })
              });
          };
        },
      },
      on: {
        DONE: {
          target: initial,
        },
        FAILURE: {
          target: 'failure',
          actions: assign({
            error: (_context, { error }) => error,
          })
        }
      }
    },
    failure: { type: 'final' }
  })

  const machine = useMemo(() => createMachine(
    {
      id: 'foo',
      context: value,
      initial,
      states
    },
    {
      actions: {
        setValue: assign((context, response) => {
          return { ...context, ...response.value }
        }),
      }
    }
  ), [])

  const [current, send] = useMachine(machine);

  useEffect(() => {
    if (!!getBreadcrumb) {
      getBreadcrumb(current.value, <Breadcrumb
        steps={steps}
        currentStep={current.value}
        chooseStep={s => send(`TO_${s}`, { value: current.context.value })}
        creation={creation}
        direction="vertical"
      />)
    }

    return () => {
      if (!!getBreadcrumb) {
        getBreadcrumb(null)
      }
    }
  }, [current.value])

  if (current.matches("save")) {
    return <Spinner />;
  }
  if (current.matches("failure")) {
    return <div>{current.context.error}</div>
  }
  const step = steps.find(s => s.id === current.value)
  return (
    <div className='d-flex flex-column'>
      <div className='d-flex flex-row flex-grow-1 col-12'>
        {step.component && (
          <ComponentedForm
            ref={ref}
            value={current.context}
            valid={response => send('NEXT', { value: response })}
            component={step.component}
            steps={steps} step={step}
            initial={initial}
            send={send}
            creation={creation} />
        )}
        {step.schema && <Form
          key={step.id}
          onSubmit={response => {
            send('NEXT', { value: response })
          }}
          onError={(errors, e) => console.error(errors, e)}
          schema={step.schema}
          flow={step.flow}
          ref={ref}
          value={current.context}
          footer={() => (null)}
        />}
        {!!report && report(current.context.value, current.value)}
      </div>
      <div className="d-flex justify-content-between">
        {steps.findIndex(s => s.id === step.id) !== 0 && <button className="btn btn-outline-danger m-3" disabled={step.id === initial} onClick={() => send("PREVIOUS")}>previous</button>}
        <div className="flex-grow-1 d-flex justify-content-end">
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-outline-primary m-3" disabled={!!creation && !step.skipTo} onClick={() => send('SKIP')}>skip</button>}
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-outline-success m-3" onClick={() => ref.current.handleSubmit()}>next</button>}
          {steps.findIndex(s => s.id === step.id) === steps.length - 1 && <button className="btn btn-outline-success m-3" onClick={() => ref.current.handleSubmit()}>save</button>}
        </div>
      </div>

    </div>
  )
}

const ComponentedForm = React.forwardRef(({ value, valid, component }, ref) => {
  const [state, setState] = useState(value)

  useImperativeHandle(ref, () => ({
    handleSubmit: () => valid(state)
  }));

  return (
    <div className="d-flex flex-column flex-grow-1">
      {React.createElement(component, {
        value: state,
        onChange: setState
      })}
    </div>
  )
})

const Breadcrumb = ({ steps, currentStep, chooseStep, creation, direction }) => {
  const currentIdx = steps.findIndex(s => s.id === currentStep)

  const handleChooseStep = idx => {
    if (!creation || idx < currentIdx) {
      chooseStep(steps[idx].id.toUpperCase())
    }
  }

  return (
    <div className={classNames('d-flex steps', { 'flex-column': direction === 'vertical', 'flex-row': direction !== 'vertical' })}>
      {steps.map((step, idx) => {
        return (
          <div
            className={classNames('step d-flex cursor-pointer ', {
              'active': currentIdx === idx,
              'finished': currentIdx > idx,
              'wait': currentIdx < idx,
              'cursor-forbidden': creation && idx > currentIdx
            })} key={idx} onClick={() => handleChooseStep(idx)}>
            <div className='step-content'>
              {step.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}