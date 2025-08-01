import { UniqueIdentifier } from '@dnd-kit/core';
import { CodeInput, constraints, Form, format, type } from '@maif/react-forms';
import classNames from 'classnames';
import { nanoid } from 'nanoid';
import React, { useContext, useEffect, useRef, useState } from 'react';
import AtSign from 'react-feather/dist/icons/at-sign';
import CreditCard from 'react-feather/dist/icons/credit-card';
import Globe from 'react-feather/dist/icons/globe';
import Plus from 'react-feather/dist/icons/plus';
import Settings from 'react-feather/dist/icons/settings';
import Trash from 'react-feather/dist/icons/trash';
import User from 'react-feather/dist/icons/user';

import { I18nContext } from '../../../contexts/i18n-context';
import { ModalContext } from '../../../contexts/modalContext';
import { ITeamSimple } from '../../../types';
import { isValidationStepEmail, isValidationStepHttpRequest, isValidationStepPayment, isValidationStepTeamAdmin, IUsagePlan, IValidationStep, IValidationStepEmail, IValidationStepHttpRequest, IValidationStepTeamAdmin, IValidationStepType } from '../../../types/api';
import { ITenant, ITenantFull } from '../../../types/tenant';
import { addArrayIf, insertArrayIndex } from '../../utils/array';
import { FixedItem, SortableItem, SortableList } from '../../utils/dnd/SortableList';
import { Help } from '../apikeys/TeamApiKeysForApi';

type MotivationFormProps = {
  saveMotivation: (m: { schema: object; formatter: string }) => void;
  value: IValidationStepTeamAdmin;
};

const MotivationForm = (props: MotivationFormProps) => {
  const [schema, setSchema] = useState<string | object>(
    props.value.schema || '{}'
  );
  const [realSchema, setRealSchema] = useState<any>(props.value.schema || {});
  const [formatter, setFormatter] = useState(props.value.formatter || '');
  const [value, setValue] = useState<any>({});
  const [example, setExample] = useState('');

  const { translate } = useContext(I18nContext);
  const { close } = useContext(ModalContext);

  const childRef = useRef(null);
  const codeInputRef = useRef(null);

  useEffect(() => {
    //@ts-ignore
    if (codeInputRef.current.hasFocus) {
      let maybeFormattedSchema = schema;
      try {
        maybeFormattedSchema =
          typeof schema === 'object' ? schema : JSON.parse(schema);
      } catch (_) { }

      setRealSchema(maybeFormattedSchema || {});
    }
  }, [schema]);

  useEffect(() => {
    const regexp = /\[\[(.+?)\]\]/g;
    const matches = formatter.match(regexp);

    const result = matches?.reduce((acc, match) => {
      const key = match.replace('[[', '').replace(']]', '');
      return acc.replace(match, value[key] || match);
    }, formatter);

    setExample(result || formatter);
  }, [value, formatter]);

  return (
    <>
      <div className="container">
        <div className="row">
          <div className="col-6">
            <h6>{translate('motivation.form.setting.title')}</h6>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.schema.label')}</label>
              <Help message={translate('motivation.form.schema.help')} />
              <CodeInput
                mode="javascript"
                onChange={(e) => {
                  setSchema(e);
                }}
                value={
                  typeof schema === 'object'
                    ? JSON.stringify(schema, null, 2)
                    : schema
                }
                setRef={(ref) => (codeInputRef.current = ref)}
              />
            </div>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.formatter.label')}</label>
              <Help message={translate('motivation.form.formatter.help')} />
              <CodeInput
                mode="markdown"
                onChange={(e) => {
                  setFormatter(e);
                }}
                value={formatter}
              />
            </div>
          </div>
          <div className="col-6 d-flex flex-column">
            <div className="flex-1">
              {/* @ts-ignore */}
              <WrapperError ref={childRef}>
                <h6>{translate('motivation.form.preview.title')}</h6>
                <i>{translate('motivation.form.sample.help')}</i>
                <Form
                  schema={realSchema}
                  onSubmit={setValue}
                  options={{
                    actions: {
                      submit: {
                        label: translate('motivation.form.sample.button.label'),
                      },
                    },
                  }}
                />
              </WrapperError>
            </div>
            <div className="flex-1">
              <div>{translate('motivation.form.sample.title')}</div>
              <div>{example}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button
          className="btn btn-outline-success"
          onClick={() => {
            props.saveMotivation({ schema: realSchema, formatter });
            close();
          }}
        >
          {translate('Save')}
        </button>
      </div>
    </>
  );
};

type ValidationStepProps = {
  step: IValidationStep;
  tenant: ITenant;
  update?: () => void;
  index: number;
};

const ValidationStep = (props: ValidationStepProps) => {
  const step = props.step;
  if (isValidationStepPayment(step)) {
    const thirdPartyPaymentSettings =
      props.tenant.thirdPartyPaymentSettings.find(
        (setting) => setting._id == step.thirdPartyPaymentSettingsId
      );
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <CreditCard />
        </span>
        <div className="d-flex flex-row validation-step__infos">
          <span>{thirdPartyPaymentSettings?.name}</span>
          <span>{thirdPartyPaymentSettings?.type}</span>
        </div>
      </div>
    );
  } else if (isValidationStepEmail(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <AtSign />
        </span>
        <div className="d-flex flex-row validation-step__infos">
          <span>{step.emails[0]}</span>
          {step.emails.length > 1 && (
            <span>{` + ${step.emails.length - 1}`}</span>
          )}
        </div>
      </div>
    );
  } else if (isValidationStepTeamAdmin(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <User />
        </span>
      </div>
    );
  } else if (isValidationStepHttpRequest(step)) {
    return (
      <div className="d-flex flex-column validation-step">
        <span className="validation-step__index">
          {String(props.index).padStart(2, '0')}
        </span>
        <span className="validation-step__name">{step.title}</span>
        <span className="validation-step__type">
          <Globe />
        </span>
      </div>
    );
  } else {
    return <></>;
  }
};

type EmailOption = { option: 'all' | 'oneOf' };

type SubProcessProps = {
  savePlan: (plan: IUsagePlan) => Promise<void>;
  plan: IUsagePlan;
  team: ITeamSimple;
  tenant: ITenant;
};
export const SubscriptionProcessEditor = (props: SubProcessProps) => {
  const { translate } = useContext(I18nContext);
  const { openCustomModal, openFormModal, close } = useContext(ModalContext);

  const [draft, setDraft] = useState(props.plan)

  const editProcess = (name: IValidationStepType, index: number) => {
    //todo: use the index !!
    switch (name) {
      case 'email':
        return openFormModal({
          title: translate('subscription.process.add.email.step.title'),
          schema: {
            title: {
              type: type.string,
              label: translate('subscription.process.email.step.title.label'),
              defaultValue: translate('subscription.process.email.step.title.defaultValue'),
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            emails: {
              type: type.string,
              format: format.email,
              label: translate('subscription.process.email.step.emails.label'),
              array: true,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.email(translate('constraints.matches.email')),
              ],
            },
            option: {
              type: type.string,
              format: format.buttonsSelect,
              options: ['all', 'oneOf'],
              defaultValue: 'oneOf',
              visible: ({ rawValues }) => {
                return rawValues.emails && rawValues.emails.length > 1;
              },
            },
            message: {
              type: type.string,
              label: translate('subscription.process.email.step.message.label'),
              format: format.text,
            },
          },
          onSubmit: (data: IValidationStepEmail & EmailOption) => {
            if (data.option === 'oneOf') {
              const step: IValidationStepEmail = {
                type: 'email',
                emails: data.emails,
                message: data.message,
                id: nanoid(32),
                title: data.title,
              };
              setDraft({
                ...draft,
                subscriptionProcess: insertArrayIndex(
                  { ...step, id: nanoid(32) },
                  draft.subscriptionProcess,
                  index
                ),
              });
            } else {
              const steps: Array<IValidationStepEmail> = data.emails.map(
                (email) => ({
                  type: 'email',
                  emails: [email],
                  message: data.message,
                  id: nanoid(32),
                  title: data.title,
                })
              );
              const subscriptionProcess = steps.reduce(
                (process, step) => insertArrayIndex(step, process, index),
                draft.subscriptionProcess
              );
              setDraft({ ...draft, subscriptionProcess });
            }
          },
          options: {
            actions: {
              add: {
                label: translate('subscription.process.email.step.add.label')
              }
            }
          },
          actionLabel: translate('Create'),
        });
      case 'teamAdmin': {
        const step: IValidationStepTeamAdmin = {
          type: 'teamAdmin',
          team: props.team._id,
          id: nanoid(32),
          title: 'Admin',
          schema: {
            motivation: {
              type: type.string,
              format: format.text,
              constraints: [{ type: 'required' }],
            },
          },
          formatter: '[[motivation]]',
        };
        setDraft({
          ...draft,
          subscriptionProcess: [step, ...draft.subscriptionProcess],
        })
        return close();
      }
      case 'httpRequest': {
        const step: IValidationStepHttpRequest = {
          type: 'httpRequest',
          id: nanoid(32),
          title: 'Admin',
          url: 'https://changeit.io',
          headers: {},
        };

        return openFormModal({
          title: translate('subscription.process.add.httpRequest.step.title'),
          schema: {
            title: {
              type: type.string,
              defaultValue: 'HttpRequest',
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            url: {
              type: type.string,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.url(translate('constraints.matches.url')),
              ],
            },
            Headers: {
              type: type.object,
              defaultValue: {},
            },
          },
          value: step,
          onSubmit: (data: IValidationStepHttpRequest) => {
            const subscriptionProcess = insertArrayIndex(
              data,
              draft.subscriptionProcess,
              index
            );
            setDraft({ ...draft, subscriptionProcess });
          },
          actionLabel: translate('Create'),
        });
      }
    }
  };

  const editMailStep = (value: IValidationStepEmail) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        emails: {
          type: type.string,
          array: true,
        },
        message: {
          type: type.string,
          format: format.text,
        },
      },
      onSubmit: (data: IValidationStepEmail) => {
        setDraft({
          ...draft,
          subscriptionProcess: draft.subscriptionProcess.map((p) => {
            if (p.id === data.id) {
              return data;
            }
            return p;
          }),
        });
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  const editHttpRequestStep = (value: IValidationStepHttpRequest) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        title: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
          ],
        },
        url: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
            constraints.url(translate('constraints.matches.url')),
          ],
        },
        Headers: {
          type: type.object,
        },
      },
      onSubmit: (data: IValidationStepHttpRequest) => {
        setDraft({
          ...draft,
          subscriptionProcess: draft.subscriptionProcess.map((p) => {
            if (p.id === data.id) {
              return data;
            }
            return p;
          }),
        });
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  //todo
  const addProcess = (index: number) => {
    const alreadyStepAdmin = draft.subscriptionProcess.some(
      isValidationStepTeamAdmin
    );

    const options = addArrayIf(
      !alreadyStepAdmin,
      [
        { value: 'email', label: translate('subscription.process.email') },
        {
          value: 'httpRequest',
          label: translate('subscription.process.httpRequest'),
        },
      ],
      {
        value: 'teamAdmin',
        label: translate('subscription.process.team.admin'),
      }
    );

    openFormModal({
      title: translate('subscription.process.creation.title'),
      schema: {
        type: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('subscription.process.type.selection'),
          options,
        },
      },
      onSubmit: (data: IValidationStep) => editProcess(data.type, index),
      actionLabel: translate('Create'),
      noClose: true,
    });
  };

  const deleteStep = (deletedStepId: UniqueIdentifier) => {
    const subscriptionProcess = draft.subscriptionProcess.filter(
      (step) => step.id !== deletedStepId
    );
    setDraft({ ...draft, subscriptionProcess });
  };

  // if (!draft.subscriptionProcess.length) {
  //   return (
  //     <div className="d-flex flex-column align-items-center">
  //       <div> {translate('api.pricings.no.step.explanation')}</div>
  //       <button
  //         className="btn btn-outline-primary my-2"
  //         onClick={() => addProcess(0)}
  //       >
  //         {translate('api.pricings.add.first.step.btn.label')}
  //       </button>
  //     </div>
  //   );
  // }

  return (
    <div>
      <div className="d-flex flex-row align-items-center">
        {!!draft.subscriptionProcess.length && (
          <button
            className="btn btn-outline-primary sortable-list-btn"
            onClick={() => addProcess(0)}
          >
            <Plus />
          </button>
        )}
        {!draft.subscriptionProcess.length && (
          <div className="d-flex flex-column align-items-center">
            <div> {translate('api.pricings.no.step.explanation')}</div>
            <button
              className="btn btn-outline-primary my-2"
              onClick={() => addProcess(0)}
            >
              {translate('api.pricings.add.first.step.btn.label')}
            </button>
          </div>
        )}
        <SortableList
          items={draft.subscriptionProcess}
          onChange={(subscriptionProcess) =>
            setDraft({ ...draft, subscriptionProcess })
          }
          className="flex-grow-1"
          renderItem={(item, idx) => {
            if (isValidationStepPayment(item)) {
              return (
                <FixedItem id={item.id}>
                  <ValidationStep
                    index={idx + 1}
                    step={item}
                    tenant={props.tenant}
                  />
                </FixedItem>
              );
            } else {
              return (
                <>
                  <SortableItem
                    className="validation-step-container"
                    action={
                      <div
                        className={classNames('d-flex flex-row', {
                          'justify-content-between':
                            !isValidationStepPayment(item),
                          'justify-content-end': isValidationStepPayment(item),
                        })}
                      >
                        {isValidationStepEmail(item) ? (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => editMailStep(item)}
                          >
                            <Settings size={15} />
                          </button>
                        ) : (
                          <></>
                        )}
                        {isValidationStepHttpRequest(item) ? (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => editHttpRequestStep(item)}
                          >
                            <Settings size={15} />
                          </button>
                        ) : (
                          <></>
                        )}
                        {isValidationStepTeamAdmin(item) ? (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() =>
                              openCustomModal({
                                title: translate('motivation.form.modal.title'),
                                content: (
                                  <MotivationForm
                                    value={item}
                                    saveMotivation={({ schema, formatter }) => {
                                      const step = { ...item, schema, formatter };
                                      const updatedPlan = {
                                        ...draft,
                                        subscriptionProcess:
                                          draft.subscriptionProcess.map(
                                            (s) => (s.id === step.id ? step : s)
                                          ),
                                      };
                                      setDraft(updatedPlan);
                                    }}
                                  />
                                ),
                              })
                            }
                          >
                            <Settings size={15} />
                          </button>
                        ) : (
                          <></>
                        )}
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteStep(item.id)}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    }
                    id={item.id}
                  >
                    <ValidationStep
                      index={idx + 1}
                      step={item}
                      tenant={props.tenant}
                    />
                  </SortableItem>
                  <button
                    className="btn btn-outline-primary sortable-list-btn"
                    onClick={() => addProcess(idx + 1)}
                  >
                    <Plus />
                  </button>
                </>
              );
            }
          }}
        />
      </div>
      {(!!draft.subscriptionProcess.length || !!props.plan.subscriptionProcess.length) && (
        <button className='btn btn-outline-success' onClick={() => props.savePlan(draft)}>save</button>
      )}
    </div>
  );
};

export class WrapperError extends React.Component {
  state = {
    error: undefined,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  reset() {
    this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) return <div>Something wrong happened</div>; //@ts-ignore
    return this.props.children;
  }
}