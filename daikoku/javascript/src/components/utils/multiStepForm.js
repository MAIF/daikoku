import React, { useState, useMemo } from 'react';
import { createMachine, assign } from 'xstate';
import { useMachine } from "@xstate/react";
import { Form } from '@maif/react-forms';
import { Steps } from 'antd';
import _ from 'lodash';

const { Step } = Steps;

export const MultiStepForm = ({ value, steps, initial, creation, report }) => {

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
          actions: ['setValue']
        },
        PREVIOUS: {
          target: previousStep ? previousStep.id : null,
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
      actions: {
        setValue: assign((context, response) => {
          console.debug({ context, response })
          return { ...context, ...response.value }
        }),
        save: (context, response) => {
          console.debug("save")
          console.debug({ context, response })
        }
      }
    }
  ), [])

  console.debug(JSON.stringify({
    id: 'foo',
    context: value,
    initial,
    states
  },
    {
      actions: {
        setValue: assign((context, response) => {
          console.debug({ context, response })
          return { ...context, ...response.value }
        }),
        save: (context, response) => {
          console.debug("save")
          console.debug({ context, response })
        }
      }
    }, null, 4))


  const [current, send] = useMachine(machine);

  if (current.matches("done")) {
    console.log({ current })
    return <div>{JSON.stringify(current.context, null, 4)}</div>;
  }

  const step = steps.find(s => s.id === current.value)
  return (
    <div>
      <Breadcrumb
        steps={steps}
        currentStep={current.value}
        chooseStep={s => send(`TO_${s}`, { value: current.context.value })}
        creation={creation} />
      <div className='d-flex flex-row'>
        {step.component && (
          <ComponentedForm
            value={value}
            valid={response => {
              if (steps.findIndex(s => s.id === step.id) !== steps.length - 1) {
                send('NEXT', { value: response })
              } else {
                send('SAVE', { value: response })
              }
            }}
            component={step.component}
            steps={steps} step={step}
            initial={initial}
            send={send}
            creation={creation} />
        )}
        {step.schema && <Form
          key={step.id}
          onSubmit={response => {
            // if (steps.findIndex(s => s.id === step.id) !== steps.length - 1) {
            send('NEXT', { value: response })
            // } else {
            //   send('SAVE', {value: response})
            // }
          }}
          onError={(errors, e) => console.error(errors, e)}
          schema={step.schema}
          flow={step.flow}
          value={current.context.value}
          footer={({ valid }) => {
            return (
              <div className="d-flex justify-content-between">
                {steps.findIndex(s => s.id === step.id) !== 0 && <button className="btn btn-danger m-3" disabled={step.id === initial} onClick={() => send("PREVIOUS")}>previous</button>}
                <div className="flex-grow-1 d-flex justify-content-end">
                  {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-primary m-3" disabled={!!creation && !step.skipTo} onClick={() => send('SKIP')}>skip</button>}
                  {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button className="btn btn-success m-3" onClick={valid}>next</button>}
                  {steps.findIndex(s => s.id === step.id) === steps.length - 1 && <button className="btn btn-success m-3" onClick={valid}>save</button>}
                </div>
              </div>
            )
          }}
        />}
        {!!report && report(current.context.value, current.value)}
      </div>

    </div>
  )
}

const ComponentedForm = ({ value, valid, component, steps, step, initial, send, creation }) => {
  const [state, setState] = useState(value)

  return (
    <>
      {React.createElement(component, {
        value: state,
        onChange: setState
      })}
      <div className="d-flex justify-content-between">
        {steps.findIndex(s => s.id === step.id) !== 0 && <button className="btn btn-danger m-3" disabled={step.id === initial} onClick={() => send("PREVIOUS")}>previous</button>}
        <div className="flex-grow-1 d-flex justify-content-end">
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button type="button" className="btn btn-primary m-3" disabled={!!creation && !step.skipTo} onClick={() => send('SKIP')}>skip</button>}
          {steps.findIndex(s => s.id === step.id) !== steps.length - 1 && <button type="button" className="btn btn-success m-3" onClick={() => valid(state)}>next</button>}
          {steps.findIndex(s => s.id === step.id) === steps.length - 1 && <button type="button" className="btn btn-success m-3" onClick={() => valid(state)}>save</button>}
        </div>
      </div>
    </>
  )
}

const Breadcrumb = ({ steps, currentStep, chooseStep, creation }) => {
  const currentIdx = steps.findIndex(s => s.id === currentStep)

  const handleChooseStep = idx => {
    if (!creation || idx < currentIdx) {
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