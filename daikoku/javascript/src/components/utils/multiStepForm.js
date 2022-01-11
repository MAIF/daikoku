import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createMachine, assign } from 'xstate';
import { useMachine } from "@xstate/react";
import { v4 as uuid } from 'uuid';
import { Form } from '@maif/react-forms';
import { Steps } from 'antd';
import _ from 'lodash';

const { Step } = Steps;

export const MultiStepForm = ({ value, steps, actions, initial, creation }) => {
  const tos = steps.reduce((acc, step) => {
    return {
      ...acc,
      [`TO_${step.id.toUpperCase()}`]: {
        target: step.id,
        actions: step.actions
      }
    }
  }, {})

  const states = steps.reduce((acc, step, i) => {
    const nextStep = steps[i + 1];
    const previousStep = steps[i - 1];
    const skipStep = step.skipTo ? {
      SKIP: {
        target: step.skipTo
      }
    } : {}
    const saveStep = i === steps.length - 1 ? {
      SAVE: {
        target: 'done',
        actions: ["save"]
      }
    } : {}
    acc[step.id] = {
      on: {
        NEXT: {
          target: nextStep ? nextStep.id : "done",
          actions: step.actions
        },
        PREVIOUS: {
          target: previousStep ? previousStep.id : initial,
        },
        ..._.omit(tos, `TO_${step.id.toUpperCase()}`),
        ...skipStep,
        ...saveStep
      }
    };
    return acc;
  }, {
    done: {
    }
  })

  const machine = useMemo(() => createMachine(
    {
      id: 'foo',
      context: value,
      initial,
      states
    },
    {
      actions
    }
  ), [])

  // console.debug(JSON.stringify({
  //   id: uuid(),
  //   context: value,
  //   initial,
  //   states
  // },
  //   {
  //     actions
  //   }))


  const [current, send] = useMachine(machine);

  if (current.matches("done")) {
    return <div>{JSON.stringify(current.context)}</div>;
  }

  const step = steps.find(s => s.id === current.value)
  return (
    <div>
      <Breadcrumb steps={steps} currentStep={current.value} chooseStep={s => send(`TO_${s}`, current.context)} creation={creation} />
      {step.component && (
        <ComponentedForm 
          value={value} 
          valid={response => {
            if (steps.findIndex(s => s.id === step.id) !== steps.length - 1) {
              send('NEXT', response)
            } else {
              send('SAVE', response)
            }
          }} 
          component={step.component} 
          steps={steps} step={step} 
          initial={initial} 
          send={send}
          creation={creation}/>
      )}
      {step.schema && <Form
        key={step.id}
        onSubmit={response => {
          if (steps.findIndex(s => s.id === step.id) !== steps.length - 1) {
            send('NEXT', response)
          } else {
            send('SAVE', response)
          }
        }}
        onError={(errors, e) => console.error(errors, e)}
        schema={step.schema}
        flow={step.flow}
        value={current.context}
        footer={({ valid }) => {
          return (
            <div className="d-flex justify-content-between">
              {steps.findIndex(s => s.id === step.id) !== 0 && <button className="btn btn-danger m-3" disabled={step.id === initial ? 'disabled' : null} onClick={() => send("PREVIOUS")}>previous</button>}
              <div className="flex-grow-1 d-flex justify-content-end">
                {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-primary m-3" disabled={creation && !step.skipTo ? 'disabled' : null} onClick={() => send('SKIP')}>skip</button>}
                {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-success m-3" onClick={valid}>next</button>}
                {steps.findIndex(s => s.id === step.id) === steps.length - 1 && <button className="btn btn-success m-3" onClick={valid}>save</button>}
              </div>
            </div>
          )
        }}
      />}
    </div>
  )
}

const ComponentedForm = ({ value, valid, component, steps, step, initial, send, creation }) => {
  const [state, setState] = useState(value)

  useEffect(() => {
    console.group('state updated')
    console.debug({state})
    console.groupEnd()
  }, [state])

  return (
    <>
      {React.createElement(component, {
        value: state,
        onChange: setState
      })}
      <div className="d-flex justify-content-between">
        {steps.findIndex(s => s.id === step.id) !== 0 && <button className="btn btn-danger m-3" disabled={step.id === initial ? 'disabled' : null} onClick={() => send("PREVIOUS")}>previous</button>}
        <div className="flex-grow-1 d-flex justify-content-end">
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-primary m-3" disabled={creation && !step.skipTo ? 'disabled' : null} onClick={() => send('SKIP')}>skip</button>}
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-success m-3" onClick={() => valid(state)}>next</button>}
          {steps.findIndex(s => s.id === step.id) === steps.length - 1 && <button className="btn btn-success m-3" onClick={() => valid(state)}>save</button>}
        </div>
      </div>
    </>
  )
}

const Breadcrumb = ({ steps, currentStep, chooseStep, creation }) => {
  const currentIdx = steps.findIndex(s => s.id === currentStep)

  const handleChooseStep = idx => {
    if (creation || idx < currentIdx) {
      chooseStep(steps[idx].id.toUpperCase())
    }
  }

  return (
    <Steps current={currentIdx} onChange={handleChooseStep}>
      {steps.map((step, idx) => {
        return (
          <Step key={idx} title={step.label} disabled={creation && idx > currentIdx} />
        )
      })}
    </Steps>
  )
}