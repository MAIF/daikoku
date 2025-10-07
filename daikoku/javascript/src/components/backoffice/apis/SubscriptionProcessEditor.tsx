import { CodeInput, constraints, Form, format, Schema, type } from '@maif/react-forms';
import classNames from 'classnames';
import { nanoid } from 'nanoid';
import React, { useContext, useEffect, useRef, useState } from 'react';
import AtSign from 'react-feather/dist/icons/at-sign';
import CreditCard from 'react-feather/dist/icons/credit-card';
import Globe from 'react-feather/dist/icons/globe';
import List from 'react-feather/dist/icons/list';
import Plus from 'react-feather/dist/icons/plus';
import Settings from 'react-feather/dist/icons/settings';
import Trash from 'react-feather/dist/icons/trash';
import User from 'react-feather/dist/icons/user';

import { toast } from 'sonner';
import { I18nContext } from '../../../contexts/i18n-context';
import { ModalContext } from '../../../contexts/modalContext';
import { IValidationStep } from '../../../types/api';
import { ITenant } from '../../../types/tenant';
import { addArrayIf, insertArrayIndex } from '../../utils/array';
import { FixedItem, SortableItem, SortableList } from '../../utils/dnd/SortableList';
import { Help } from '../apikeys/TeamApiKeysForApi';

type MotivationFormProps = {
  saveMotivation: (m: { schema: Schema; formatter: string, formKeysToMetadata?: Array<string>, info?: string }) => void;
  value: IValidationStep & { type: 'form' };
};

const MotivationForm = (props: MotivationFormProps) => {
  const [schema, setSchema] = useState<string | Schema>(
    props.value.schema || '{}'
  );
  const [realSchema, setRealSchema] = useState<any>(props.value.schema || {});
  const [formatter, setFormatter] = useState(props.value.formatter || '');
  const [formKeysToMetadata, setFormKeysToMetadata] = useState<Array<string>>()
  const [value, setValue] = useState<any>({});
  const [example, setExample] = useState('');
  const [info, setInfo] = useState(props.value.info)

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
          <div className="col-12">
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.info.label')}</label>
              <Help message={translate('motivation.form.info.help')} />
              <CodeInput
                mode="javascript"
                onChange={setInfo}
                value={props.value.info}
              />
            </div>
          </div>
        </div>
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
            <div className="flex-1 mt-1">
              <div>{translate('motivation.form.formKeysToMetadata.title')}</div>
              <div>
                <Form
                  schema={{
                    formKeysToMetadata: {
                      type: type.string,
                      isMulti: true,
                      format: format.select,
                      options: Object.keys(realSchema),
                      label: translate('motivation.form.formKeysToMetadata.label')
                    }
                  }}
                  onSubmit={d => setFormKeysToMetadata(d.formKeysToMetadata)}
                  value={{ formKeysToMetadata: props.value.formKeysToMetadata }}
                  options={{ autosubmit: true, actions: { submit: { display: false } } }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button
          className="btn btn-outline-success"
          onClick={() => {
            props.saveMotivation({ schema: realSchema, formatter, formKeysToMetadata, info });
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
  switch (step.type) {
    case 'payment':
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
    case 'email':
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
    case 'teamAdmin':
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
    case 'httpRequest':
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
    case 'form':
      return (
        <div className="d-flex flex-column validation-step">
          <span className="validation-step__index">
            {String(props.index).padStart(2, '0')}
          </span>
          <span className="validation-step__name">{step.title}</span>
          <span className="validation-step__type">
            <List />
          </span>
        </div>
      )
  }
};

type EmailOption = { option: 'all' | 'oneOf' };

type SubProcessProps = {
  save: (process: Array<IValidationStep>) => Promise<void>;
  process: Array<IValidationStep>;
  team: string;
  tenant: ITenant;
  documentation?: React.ComponentType<{ close: () => void, updateProcess: (process: IValidationStep[]) => void }>
};
type IValidationStepEmail = IValidationStep & { type: 'email' };
type IValidationStepForm = IValidationStep & { type: 'form' };
type IValidationStepTeamAdmin = IValidationStep & { type: 'teamAdmin' };
type IValidationStepHttpRequest = IValidationStep & { type: 'httpRequest' };

export const SubscriptionProcessEditor = (props: SubProcessProps) => {
  const { translate } = useContext(I18nContext);
  const { openCustomModal, openFormModal, close } = useContext(ModalContext);

  const [draft, setDraft] = useState(props.process)
  const [showDocumentation, setShowDocumentation] = useState(false);

  const editProcess = (name: string, index: number) => {
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
          onSubmit: (data: IValidationStep & { type: 'email' } & EmailOption) => {
            if (data.option === 'oneOf') {
              const step: IValidationStepEmail = {
                type: 'email',
                emails: data.emails,
                message: data.message,
                id: nanoid(32),
                title: data.title,
              };
              setDraft(insertArrayIndex(
                { ...step, id: nanoid(32) },
                draft,
                index
              ));
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
                draft
              );
              setDraft(subscriptionProcess);
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
      case 'form': {
        const step: IValidationStepForm = {
          type: 'form',
          id: nanoid(32),
          title: 'Form',
          schema: {
            motivation: {
              type: type.string,
              format: format.text,
              constraints: [{ type: 'required' }],
            },
          },
          formatter: '[[motivation]]',
        };
        setDraft([step, ...draft])
        return close();
      }
      case 'teamAdmin': {
        const step: IValidationStepTeamAdmin = {
          type: 'teamAdmin',
          team: props.team,
          id: nanoid(32),
          title: 'Admin',
        };
        if (draft.some(e => e.type === 'form')) {
          setDraft([step, ...draft])
        } else {
          const formStep: IValidationStepForm = {
            type: 'form',
            id: nanoid(32),
            title: 'Form',
            schema: {
              motivation: {
                type: type.string,
                format: format.text,
                constraints: [{ type: 'required' }],
              },
            },
            formatter: '[[motivation]]',
          };
          toast.info('on a ajouté un step form, obloigatoire pour le bon fonctionnement du step admin')
          setDraft([formStep, step, ...draft])
        }
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
                // constraints.url(translate('constraints.matches.url')),
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
              draft,
              index
            );
            setDraft(subscriptionProcess);
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
        setDraft(draft.map((p) => {
          if (p.id === data.id) {
            return data;
          }
          return p;
        }));
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
            // constraints.url(translate('constraints.matches.url')),
          ],
        },
        Headers: {
          type: type.object,
        },
      },
      onSubmit: (data: IValidationStepHttpRequest) => {
        setDraft(draft.map((p) => {
          if (p.id === data.id) {
            return data;
          }
          return p;
        }));
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  //todo
  const addProcess = (index: number) => {
    const alreadyStepAdmin = draft.some(
      s => s.type === 'teamAdmin'
    );
    const alreadyStepForm = draft.some(
      s => s.type === 'form'
    );

    const options = addArrayIf(!alreadyStepForm, addArrayIf(
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
    ), {
      value: 'form',
      label: translate('subscription.process.form'),
    })

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

  const deleteStep = (deletedStep: IValidationStep) => {
    if (deletedStep.type === 'form' && draft.some(s => s.type === 'teamAdmin')) {
      toast.error('pas le droit de supprimer le step form tant qu\'un step admin est preszent')
      return;
    }


    const subscriptionProcess = draft.filter(
      (step) => step.id !== deletedStep.id
    );
    setDraft(subscriptionProcess);
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

  const Documentation = props.documentation ?? React.Fragment
  return (
    <div>
      {props.documentation && <button
        className='btn btn-outline-info mb-5'
        onClick={() => setShowDocumentation(!showDocumentation)}>
        {translate(`tenant.security.account.creation.process.doc.${showDocumentation ? 'close' : 'open'}.aria`)}
      </button>}
      <div className="d-flex flex-row align-items-center">
        {!!draft.length && (
          <button
            className="btn btn-outline-primary sortable-list-btn"
            onClick={() => addProcess(0)}
          >
            <Plus />
          </button>
        )}
        {!draft.length && (
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
          items={draft}
          onChange={(subscriptionProcess) =>
            setDraft(subscriptionProcess)
          }
          className="flex-grow-1"
          renderItem={(item, idx) => {
            if (item.type === 'form') {
              return (
                <FixedItem
                  id={item.id}
                  className="validation-step-container"
                  action={<div
                    className='d-flex flex-row justify-content-between'
                  >
                    <button
                      className="btn btn-sm btn-outline-info"
                      onClick={() =>
                        openCustomModal({
                          title: translate('motivation.form.modal.title'),
                          content: (
                            <MotivationForm
                              value={item}
                              saveMotivation={({ schema, formatter, formKeysToMetadata, info }) => {
                                const step = { ...item, schema, formatter, formKeysToMetadata, info };
                                const updatedProcess = draft.map(
                                  (s) => (s.id === step.id ? step : s)
                                );
                                setDraft(updatedProcess);
                              }}
                            />
                          ),
                        })
                      }
                    >
                      <Settings size={15} />
                    </button>
                  </div>}>
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
                          'justify-content-between': item.type !== 'payment',
                          'justify-content-end': item.type === 'payment',
                        })}
                      >
                        {item.type === 'email' && (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => editMailStep(item)}
                          >
                            <Settings size={15} />
                          </button>
                        )}
                        {item.type === 'httpRequest' && (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => editHttpRequestStep(item)}
                          >
                            <Settings size={15} />
                          </button>
                        )}
                        {/* {item.type === 'form' && (
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
                                          draft.map(
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
                        )} */}
                        <button
                          className="btn btn-sm btn-outline-danger"
                          // disabled={item.type === 'form' && draft.some(s => s.type === 'teamAdmin')}
                          onClick={() => deleteStep(item)}
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
      {showDocumentation && <Documentation close={() => setShowDocumentation(false)} updateProcess={(steps) => setDraft(steps)} />}
      {(!!draft.length || !!props.process.length) && (
        <button className='btn btn-outline-success' onClick={() => props.save(draft)}>save</button>
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